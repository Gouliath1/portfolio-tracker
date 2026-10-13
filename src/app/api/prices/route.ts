/**
 * Current prices.
 *
 *   GET /api/prices?symbol=AAPL            -> { price, date, stale? }
 *   GET /api/prices?symbols=AAPL,7203.T    -> { prices: { AAPL: {price,date,stale?}|null, ... } }
 *
 * The batch form exists so a portfolio load is one call instead of one per
 * ticker. Prices are shared across all users: a symbol fetched once today is
 * served to everyone from the DB cache (no Yahoo call, no write), and the
 * response is CDN-cacheable. `fresh=1` is honoured at most once per symbol per
 * cooldown, so many users pressing Refresh collapse into one upstream fetch.
 *
 * There is intentionally no POST: accepting client-supplied prices would let
 * anyone poison the shared cache.
 */

import { NextResponse } from 'next/server';
import { getCachedTodayPrice, getLastKnownPrice, setCachedPrice } from '../../../lib/server/memoryStore';
import { getCachedFundamentalsBatch, setCachedFundamentalsBatch } from '../../../lib/server/marketDataDb';
import { fetchChartMeta } from '@portfolio/core';
import {
    parseSymbolsLenient, isValidSymbol, badRequest, cdnCache, NO_STORE,
    expensiveRoutesDisabled, allowForcedRefresh, overLimit, clientIp,
    MAX_SYMBOLS_PER_REQUEST,
} from '../../../lib/server/requestGuards';

const today = () => new Date().toISOString().split('T')[0];
const FORCE_COOLDOWN_MS = 60_000;
const FETCH_CONCURRENCY = 5;

type PriceResult = { price: number; date: string; stale?: true } | null;

/** Cached price from the shared DB row, if it was fetched today. */
function fromDb(
    row: { data: { price: number | null }; fetchedAt: string } | undefined,
): { price: number; date: string } | null {
    if (!row || row.data.price == null) return null;
    if (row.fetchedAt.slice(0, 10) !== today()) return null;
    return { price: row.data.price, date: today() };
}

async function resolve(symbols: string[], forceFresh: Set<string>): Promise<Record<string, PriceResult>> {
    const out: Record<string, PriceResult> = {};
    const db = await getCachedFundamentalsBatch(symbols);

    const toFetch: string[] = [];
    for (const symbol of symbols) {
        if (!forceFresh.has(symbol)) {
            const mem = getCachedTodayPrice(symbol);
            if (mem !== null) { out[symbol] = { price: mem, date: today() }; continue; }
            const hit = fromDb(db.get(symbol));
            if (hit) { setCachedPrice(symbol, hit.price); out[symbol] = hit; continue; }
        }
        toFetch.push(symbol);
    }

    // Kill switch: serve what we have (cache, last known), fetch nothing.
    if (expensiveRoutesDisabled()) {
        for (const symbol of toFetch) {
            const stale = getLastKnownPrice(symbol);
            const row = db.get(symbol)?.data.price;
            out[symbol] = stale
                ? { price: stale.price, date: stale.date, stale: true }
                : row != null ? { price: row, date: today(), stale: true } : null;
        }
        return out;
    }

    const writes: Array<{ ticker: string; price: { name: string | null; price: number | null; currency: string | null } }> = [];
    let next = 0;
    const worker = async () => {
        while (next < toFetch.length) {
            const symbol = toFetch[next++];
            // The chart endpoint returns price, name and currency in one call, so the
            // shared row is complete and the screener can reuse it as-is.
            const meta = await fetchChartMeta(symbol);
            if (meta?.price != null) {
                setCachedPrice(symbol, meta.price);
                writes.push({ ticker: symbol, price: meta });
                out[symbol] = { price: meta.price, date: today() };
                continue;
            }
            // Yahoo rejected us (rate limit or transient): serve the last known
            // price rather than leaving the row stuck on "Loading…".
            const stale = getLastKnownPrice(symbol);
            out[symbol] = stale ? { price: stale.price, date: stale.date, stale: true } : null;
        }
    };
    await Promise.all(Array.from({ length: Math.min(FETCH_CONCURRENCY, toFetch.length) }, worker));

    // One batched write for everything fetched, so the next user hits the DB.
    await setCachedFundamentalsBatch(writes);
    return out;
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const single = searchParams.get('symbol');
    const batch = searchParams.get('symbols');
    const wantsFresh = searchParams.get('fresh') === '1';

    if (overLimit(`prices:${clientIp(request)}`, 120, 60_000)) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '30' } });
    }

    let symbols: string[];
    let invalid: string[] = [];
    if (batch !== null) {
        const parsed = parseSymbolsLenient(batch, MAX_SYMBOLS_PER_REQUEST);
        if (parsed.rejected || (parsed.symbols.length === 0 && parsed.invalid.length === 0)) {
            return badRequest(`symbols: 1-${MAX_SYMBOLS_PER_REQUEST} symbols required`);
        }
        symbols = parsed.symbols;
        invalid = parsed.invalid;
    } else {
        if (!single) return badRequest('Symbol is required');
        if (!isValidSymbol(single)) return badRequest('Invalid symbol');
        symbols = [single];
    }

    // A forced refresh is honoured once per symbol per cooldown; everyone else
    // in that window reads the result it just produced.
    const forceFresh = new Set<string>();
    if (wantsFresh && !expensiveRoutesDisabled()) {
        for (const s of symbols) if (allowForcedRefresh(`price:${s}`, FORCE_COOLDOWN_MS)) forceFresh.add(s);
    }

    const results = await resolve(symbols, forceFresh);
    const headers = forceFresh.size > 0 ? NO_STORE : cdnCache(60, 300);

    if (batch !== null) {
        for (const s of invalid) results[s] = null; // reported, never fetched
        return NextResponse.json({ prices: results }, { headers });
    }

    const r = results[symbols[0]];
    return NextResponse.json(r ?? { price: null, date: null }, { headers });
}
