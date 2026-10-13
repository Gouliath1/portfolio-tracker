/**
 * Batch screener refresh.
 *
 *   POST /api/screener/refresh
 *   { symbols: string[] (<= 50), tier?: 'price' | 'full', maxAgeMinutes?: number, force?: boolean, stream?: boolean }
 *
 * With `stream: true` the response is NDJSON — one `{symbol, data}` line per row as
 * soon as it is ready, then a final `{done, refreshed, cached, failed}` line.
 *
 * "Refresh all" in the UI is this endpoint called in chunks: ~36 requests for
 * the ~1800-name TOPIX universe instead of ~1800, with one batched DB write
 * per chunk instead of two writes per symbol.
 *
 * The first refresh of a market day fetches from Yahoo; every refresh after
 * that, by any user, is answered from the shared DB (`cached` in the response
 * says how many). `force` re-fetches but each symbol is forced at most once per
 * cooldown, so many users forcing at once still cost one fetch per symbol.
 */

import { NextResponse } from 'next/server';
import { getCachedFundamentalsBatch, setCachedFundamentalsBatch, type FundamentalsWrite } from '../../../../lib/server/marketDataDb';
import { refreshSymbol } from '../../../../lib/server/screenerRefresh';
import {
    parseSymbols, badRequest, NO_STORE, allowForcedRefresh, overLimit, clientIp,
    expensiveRoutesDisabled,
} from '../../../../lib/server/requestGuards';

export const dynamic = 'force-dynamic';

const MAX_SYMBOLS = 50;
const CONCURRENCY = 2; // upstream calls are serialized per instance; more only delays the first row
/** Persist in small batches while streaming so a dropped connection loses little. */
const FLUSH_EVERY = 10;
const FORCE_COOLDOWN_MS = 5 * 60_000;
/** Alert polling may want intraday prices, but never fresher than this. */
const MIN_MAX_AGE_MS = 10 * 60_000;

export async function POST(request: Request) {
    if (overLimit(`sr:${clientIp(request)}`, 60, 60_000)) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '30' } });
    }

    let body: { symbols?: unknown; tier?: unknown; maxAgeMinutes?: unknown; force?: unknown; stream?: unknown };
    try {
        const raw = await request.text();
        if (raw.length > 20_000) return badRequest('Body too large');
        body = JSON.parse(raw);
    } catch {
        return badRequest('Invalid JSON');
    }

    const parsed = parseSymbols(Array.isArray(body.symbols) ? body.symbols.join(',') : null, MAX_SYMBOLS);
    if (parsed.rejected || parsed.symbols.length === 0) return badRequest(`symbols: 1-${MAX_SYMBOLS} valid symbols required`);
    const symbols = parsed.symbols;

    const priceOnly = body.tier === 'price';
    const priceMaxAgeMs = typeof body.maxAgeMinutes === 'number' && body.maxAgeMinutes > 0
        ? Math.max(MIN_MAX_AGE_MS, body.maxAgeMinutes * 60_000)
        : undefined;

    const cachedRows = await getCachedFundamentalsBatch(symbols);
    const disabled = expensiveRoutesDisabled();
    const wantsStream = body.stream === true;

    const tally = { refreshed: 0, cached: 0, failed: 0 };
    const writes: FundamentalsWrite[] = [];
    const flush = async () => {
        const batch = writes.splice(0);
        if (batch.length > 0) await setCachedFundamentalsBatch(batch);
    };

    /** Resolve one symbol to its response row (or null on failure), updating the tallies. */
    const processSymbol = async (symbol: string): Promise<Record<string, unknown> | null> => {
        const cached = cachedRows.get(symbol) ?? null;

        if (disabled) {
            if (!cached) { tally.failed++; return null; }
            tally.cached++;
            return { ...cached.data, source: 'cache', ratiosPending: cached.ratiosFetchedAt == null,
                fetchedAt: cached.fetchedAt, ratiosFetchedAt: cached.ratiosFetchedAt };
        }

        const forceFresh = body.force === true && allowForcedRefresh(`screener:${symbol}`, FORCE_COOLDOWN_MS);
        const o = await refreshSymbol(symbol, cached, { forceFresh, priceOnly, priceMaxAgeMs });
        if (o.failed) { tally.failed++; return null; }
        if (o.write) writes.push(o.write);
        if (o.touchedUpstream) tally.refreshed++; else tally.cached++;
        return {
            ...o.result,
            source: o.source,
            ratiosPending: o.ratiosPending,
            fetchedAt: o.fetchedAt,
            ratiosFetchedAt: o.ratiosFetchedAt,
            ...(o.ratiosError ? { ratiosError: o.ratiosError } : {}),
        };
    };

    // Streaming: each row is sent the moment it is ready, so the UI fills in
    // steadily instead of waiting for the whole chunk. DB writes are flushed in
    // small batches as results arrive, and once more when the stream ends or the
    // client goes away, so nothing fetched is lost.
    if (wantsStream) {
        const encoder = new TextEncoder();
        let aborted = false;
        const stream = new ReadableStream({
            async start(controller) {
                const send = (obj: unknown) => {
                    if (!aborted) controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
                };
                let next = 0;
                const worker = async () => {
                    while (next < symbols.length && !aborted) {
                        const symbol = symbols[next++];
                        const row = await processSymbol(symbol);
                        if (row) send({ symbol, data: row });
                        if (writes.length >= FLUSH_EVERY) await flush();
                    }
                };
                await Promise.all(Array.from({ length: Math.min(CONCURRENCY, symbols.length) }, worker));
                await flush();
                send({ done: true, ...tally, disabled });
                if (!aborted) controller.close();
            },
            async cancel() {
                aborted = true;
                await flush();
            },
        });
        return new Response(stream, {
            headers: { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store' },
        });
    }

    const results: Record<string, unknown> = {};
    let next = 0;
    const worker = async () => {
        while (next < symbols.length) {
            const symbol = symbols[next++];
            const row = await processSymbol(symbol);
            if (row) results[symbol] = row;
        }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, symbols.length) }, worker));
    await flush();

    return NextResponse.json({ results, ...tally, disabled }, { headers: NO_STORE });
}
