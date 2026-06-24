/**
 * Shared market-data cache (prices and FX rates).
 *
 * Market data is universal — AAPL's close on 2020-01-15 is the same for every
 * user — so a single shared server-side cache is the right shape. Positions
 * stay in browser localStorage (per-user privacy).
 *
 * Storage:
 *   - Local dev: SQLite file at data/marketCache.db.
 *   - Vercel prod: Turso (cloud SQLite) via TURSO_DATABASE_URL / TURSO_AUTH_TOKEN.
 *     Required because Vercel's runtime filesystem is read-only.
 *
 * An in-memory layer sits in front of the DB so we don't hit disk on every
 * request within a single function instance.
 */

import { createClient, Client } from '@libsql/client';
import { forwardFillLookup } from '@portfolio/core';
import type { StockFundamentals } from '@portfolio/types/screener';
import { dirname } from 'path';
import { mkdirSync } from 'fs';

type DateString = string; // YYYY-MM-DD

const DEFAULT_LOCAL_PATH = './data/marketCache.db';

let _client: Client | null = null;
let _initPromise: Promise<void> | null = null;
let _storageUnavailable = false; // sticky flag — once we know storage is broken, stop trying

// Vercel's runtime filesystem is read-only, so a local SQLite file can't be
// created in serverless. If Turso credentials aren't set in that environment,
// we treat the cache as unavailable rather than crashing every route.
function isServerlessReadOnlyFs(): boolean {
    return !!process.env.VERCEL;
}

function getClient(): Client | null {
    if (_storageUnavailable) return null;
    if (_client) return _client;

    const tursoUrl = process.env.TURSO_DATABASE_URL;
    const tursoToken = process.env.TURSO_AUTH_TOKEN;

    try {
        if (tursoUrl && tursoToken) {
            _client = createClient({ url: tursoUrl, authToken: tursoToken });
        } else if (isServerlessReadOnlyFs()) {
            console.warn('[marketDataDb] No TURSO_DATABASE_URL/TOKEN set and running on Vercel — disabling persistent cache. Routes will fall through to upstream APIs.');
            _storageUnavailable = true;
            return null;
        } else {
            const path = process.env.MARKET_DB_PATH ?? DEFAULT_LOCAL_PATH;
            try { mkdirSync(dirname(path), { recursive: true }); } catch { /* exists */ }
            _client = createClient({ url: `file:${path}` });
        }
        return _client;
    } catch (err) {
        console.warn('[marketDataDb] Failed to initialize storage:', err);
        _storageUnavailable = true;
        return null;
    }
}

async function ensureInit(): Promise<boolean> {
    if (_storageUnavailable) return false;
    if (_initPromise) {
        await _initPromise;
        return !_storageUnavailable;
    }
    _initPromise = (async () => {
        const c = getClient();
        if (!c) return;
        try {
            await c.execute(`
                CREATE TABLE IF NOT EXISTS security_prices (
                    ticker TEXT NOT NULL,
                    price_date TEXT NOT NULL,
                    close_price REAL NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (ticker, price_date)
                )
            `);
            await c.execute(`
                CREATE TABLE IF NOT EXISTS market_fx_rates (
                    pair TEXT NOT NULL,
                    rate_date TEXT NOT NULL,
                    rate REAL NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (pair, rate_date)
                )
            `);
            await c.execute(`
                CREATE TABLE IF NOT EXISTS dividend_events (
                    ticker TEXT NOT NULL,
                    ex_date TEXT NOT NULL,
                    amount_per_share REAL NOT NULL,
                    currency TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (ticker, ex_date)
                )
            `);
            // Tracks when we last refreshed the dividend series for a ticker.
            // Needed because dividends are sparse (often quarterly), so the
            // most recent ex_date isn't a reliable freshness signal — a
            // ticker that hasn't paid in 6 months would otherwise never get
            // re-checked.
            await c.execute(`
                CREATE TABLE IF NOT EXISTS dividend_refresh (
                    ticker TEXT PRIMARY KEY,
                    refreshed_at TEXT NOT NULL
                )
            `);
            // Screener fundamentals — one row per ticker. Price/name/currency come
            // from the no-auth chart endpoint (reliable); the valuation ratios come
            // from the crumb-authed quoteSummary (flaky). We track their freshness
            // separately (fetched_at = price, ratios_fetched_at = ratios) so a crumb
            // outage doesn't freeze the ratios as "fresh" for a day.
            await c.execute(`
                CREATE TABLE IF NOT EXISTS security_fundamentals (
                    ticker TEXT PRIMARY KEY,
                    name TEXT,
                    price REAL,
                    currency TEXT,
                    trailing_pe REAL,
                    forward_pe REAL,
                    dividend_yield REAL,
                    price_to_book REAL,
                    market_cap REAL,
                    fetched_at TEXT NOT NULL,
                    ratios_fetched_at TEXT
                )
            `);
            // Existing DBs predate ratios_fetched_at — add it if missing.
            const fcols = await c.execute('PRAGMA table_info(security_fundamentals)');
            if (!fcols.rows.some(r => String(r.name) === 'ratios_fetched_at')) {
                await c.execute('ALTER TABLE security_fundamentals ADD COLUMN ratios_fetched_at TEXT');
            }
            // Persisted Yahoo cookie+crumb (single row) so the rare successful
            // acquisition survives restarts and is reused for hours.
            await c.execute(`
                CREATE TABLE IF NOT EXISTS yahoo_auth (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    cookie TEXT NOT NULL,
                    crumb TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            `);
        } catch (err) {
            console.warn('[marketDataDb] Schema init failed:', err);
            _storageUnavailable = true;
        }
    })();
    await _initPromise;
    return !_storageUnavailable;
}

// ── In-memory layer ──────────────────────────────────────────────────────────
//
// Loaded per-ticker on first read; populated by both DB hits and Yahoo writes.
// The DB is still the source of truth — this just avoids round-trips inside a
// single function instance.

type DividendRow = { amount: number; currency: string };

const _memPrices = new Map<string, Map<DateString, number>>();
const _memFx = new Map<string, Map<DateString, number>>();
const _memDividends = new Map<string, Map<DateString, DividendRow>>();
const _memFundamentals = new Map<string, { data: StockFundamentals; fetchedAt: string; ratiosFetchedAt: string | null }>();
const _loadedPriceKeys = new Set<string>();
const _loadedFxKeys = new Set<string>();
const _loadedDividendKeys = new Set<string>();
const _loadedFundamentalsKeys = new Set<string>();

async function loadPricesForTicker(ticker: string): Promise<void> {
    if (_loadedPriceKeys.has(ticker)) return;
    if (!(await ensureInit())) {
        _loadedPriceKeys.add(ticker); // mark as "tried" so we don't retry every call
        return;
    }
    const c = getClient();
    if (!c) return;
    try {
        const rows = await c.execute({
            sql: 'SELECT price_date, close_price FROM security_prices WHERE ticker = ?',
            args: [ticker],
        });
        const map = _memPrices.get(ticker) ?? new Map<DateString, number>();
        for (const row of rows.rows) {
            map.set(row.price_date as string, Number(row.close_price));
        }
        _memPrices.set(ticker, map);
        _loadedPriceKeys.add(ticker);
    } catch (err) {
        console.warn(`[marketDataDb] Read prices failed for ${ticker}:`, err);
        _loadedPriceKeys.add(ticker);
    }
}

async function loadDividendsForTicker(ticker: string): Promise<void> {
    if (_loadedDividendKeys.has(ticker)) return;
    if (!(await ensureInit())) {
        _loadedDividendKeys.add(ticker);
        return;
    }
    const c = getClient();
    if (!c) return;
    try {
        const rows = await c.execute({
            sql: 'SELECT ex_date, amount_per_share, currency FROM dividend_events WHERE ticker = ?',
            args: [ticker],
        });
        const map = _memDividends.get(ticker) ?? new Map<DateString, DividendRow>();
        for (const row of rows.rows) {
            map.set(row.ex_date as string, {
                amount: Number(row.amount_per_share),
                currency: row.currency as string,
            });
        }
        _memDividends.set(ticker, map);
        _loadedDividendKeys.add(ticker);
    } catch (err) {
        console.warn(`[marketDataDb] Read dividends failed for ${ticker}:`, err);
        _loadedDividendKeys.add(ticker);
    }
}

async function loadFxForPair(pair: string): Promise<void> {
    if (_loadedFxKeys.has(pair)) return;
    if (!(await ensureInit())) {
        _loadedFxKeys.add(pair);
        return;
    }
    const c = getClient();
    if (!c) return;
    try {
        const rows = await c.execute({
            sql: 'SELECT rate_date, rate FROM market_fx_rates WHERE pair = ?',
            args: [pair],
        });
        const map = _memFx.get(pair) ?? new Map<DateString, number>();
        for (const row of rows.rows) {
            map.set(row.rate_date as string, Number(row.rate));
        }
        _memFx.set(pair, map);
        _loadedFxKeys.add(pair);
    } catch (err) {
        console.warn(`[marketDataDb] Read FX failed for ${pair}:`, err);
        _loadedFxKeys.add(pair);
    }
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Return all cached prices for a ticker as { date: price }. */
export async function getCachedHistoricalPrices(ticker: string): Promise<Record<DateString, number>> {
    await loadPricesForTicker(ticker);
    const map = _memPrices.get(ticker);
    return map ? Object.fromEntries(map) : {};
}

/** Bulk-insert (or update) prices for a ticker. Dates use YYYY-MM-DD. */
export async function setCachedHistoricalPrices(ticker: string, prices: Record<DateString, number>): Promise<void> {
    const entries = Object.entries(prices);
    if (entries.length === 0) return;

    // Update in-memory layer regardless — keeps the within-process cache warm
    // even when persistent storage is unavailable.
    const map = _memPrices.get(ticker) ?? new Map<DateString, number>();
    for (const [date, price] of entries) map.set(date, price);
    _memPrices.set(ticker, map);
    _loadedPriceKeys.add(ticker);

    if (!(await ensureInit())) return;
    const c = getClient();
    if (!c) return;
    try {
        await c.batch(
            entries.map(([date, price]) => ({
                sql: `INSERT INTO security_prices (ticker, price_date, close_price)
                      VALUES (?, ?, ?)
                      ON CONFLICT (ticker, price_date) DO UPDATE SET close_price = excluded.close_price`,
                args: [ticker, date, price],
            })),
            'write',
        );
    } catch (err) {
        console.warn(`[marketDataDb] Write prices failed for ${ticker}:`, err);
    }
}

/** Return all cached FX rates for a pair (e.g. "USDJPY") as { date: rate }. */
// ── Screener fundamentals ────────────────────────────────────────────────────

async function loadFundamentalsForTicker(ticker: string): Promise<void> {
    if (_loadedFundamentalsKeys.has(ticker)) return;
    if (!(await ensureInit())) { _loadedFundamentalsKeys.add(ticker); return; }
    const c = getClient();
    if (!c) return;
    try {
        const rows = await c.execute({
            sql: 'SELECT * FROM security_fundamentals WHERE ticker = ?',
            args: [ticker],
        });
        const row = rows.rows[0];
        if (row) {
            const num = (v: unknown) => (v == null ? null : Number(v));
            _memFundamentals.set(ticker, {
                fetchedAt: row.fetched_at as string,
                ratiosFetchedAt: (row.ratios_fetched_at as string) ?? null,
                data: {
                    symbol: ticker,
                    name: (row.name as string) ?? null,
                    price: num(row.price),
                    currency: (row.currency as string) ?? null,
                    trailingPE: num(row.trailing_pe),
                    forwardPE: num(row.forward_pe),
                    dividendYield: num(row.dividend_yield),
                    priceToBook: num(row.price_to_book),
                    marketCap: num(row.market_cap),
                },
            });
        }
        _loadedFundamentalsKeys.add(ticker);
    } catch (err) {
        console.warn(`[marketDataDb] Read fundamentals failed for ${ticker}:`, err);
        _loadedFundamentalsKeys.add(ticker);
    }
}

/** Cached fundamentals for a ticker, with separate price/ratios fetch times. */
export async function getCachedFundamentals(
    ticker: string,
): Promise<{ data: StockFundamentals; fetchedAt: string; ratiosFetchedAt: string | null } | null> {
    await loadFundamentalsForTicker(ticker);
    return _memFundamentals.get(ticker) ?? null;
}

/** Basics from the no-auth chart endpoint (price/name/currency). */
export interface PriceInfo { name: string | null; price: number | null; currency: string | null; }
/** Valuation ratios from the crumb-authed quoteSummary. */
export interface RatioInfo {
    trailingPE: number | null; forwardPE: number | null; dividendYield: number | null;
    priceToBook: number | null; marketCap: number | null;
}

function mergeMem(ticker: string, patch: Partial<StockFundamentals>, stamp: { price?: string; ratios?: string }) {
    const prev = _memFundamentals.get(ticker);
    const base: StockFundamentals = prev?.data ?? {
        symbol: ticker, name: null, price: null, currency: null,
        trailingPE: null, forwardPE: null, dividendYield: null, priceToBook: null, marketCap: null,
    };
    _memFundamentals.set(ticker, {
        data: { ...base, ...patch, symbol: ticker },
        fetchedAt: stamp.price ?? prev?.fetchedAt ?? new Date().toISOString(),
        ratiosFetchedAt: stamp.ratios ?? prev?.ratiosFetchedAt ?? null,
    });
    _loadedFundamentalsKeys.add(ticker);
}

/** Upsert price/name/currency, stamping fetched_at (price freshness). */
export async function setCachedPriceInfo(ticker: string, info: PriceInfo): Promise<void> {
    const now = new Date().toISOString();
    mergeMem(ticker, info, { price: now });
    if (!(await ensureInit())) return;
    const c = getClient();
    if (!c) return;
    try {
        await c.execute({
            sql: `INSERT INTO security_fundamentals (ticker, name, price, currency, fetched_at)
                  VALUES (?, ?, ?, ?, ?)
                  ON CONFLICT (ticker) DO UPDATE SET
                    name = excluded.name, price = excluded.price,
                    currency = excluded.currency, fetched_at = excluded.fetched_at`,
            args: [ticker, info.name, info.price, info.currency, now],
        });
    } catch (err) {
        console.warn(`[marketDataDb] Write price info failed for ${ticker}:`, err);
    }
}

/** Upsert valuation ratios, stamping ratios_fetched_at. */
export async function setCachedRatios(ticker: string, info: RatioInfo): Promise<void> {
    const now = new Date().toISOString();
    mergeMem(ticker, info, { ratios: now });
    if (!(await ensureInit())) return;
    const c = getClient();
    if (!c) return;
    try {
        // Ensure a row exists (price may not have been written first), then update ratios.
        await c.execute({
            sql: `INSERT INTO security_fundamentals (ticker, fetched_at, trailing_pe, forward_pe, dividend_yield, price_to_book, market_cap, ratios_fetched_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                  ON CONFLICT (ticker) DO UPDATE SET
                    trailing_pe = excluded.trailing_pe, forward_pe = excluded.forward_pe,
                    dividend_yield = excluded.dividend_yield, price_to_book = excluded.price_to_book,
                    market_cap = excluded.market_cap, ratios_fetched_at = excluded.ratios_fetched_at`,
            args: [ticker, now, info.trailingPE, info.forwardPE, info.dividendYield, info.priceToBook, info.marketCap, now],
        });
    } catch (err) {
        console.warn(`[marketDataDb] Write ratios failed for ${ticker}:`, err);
    }
}

// ── Persisted Yahoo auth (cookie + crumb) ────────────────────────────────────

export async function getStoredYahooAuth(): Promise<{ cookie: string; crumb: string } | null> {
    if (!(await ensureInit())) return null;
    const c = getClient();
    if (!c) return null;
    try {
        const rows = await c.execute('SELECT cookie, crumb FROM yahoo_auth WHERE id = 1');
        const row = rows.rows[0];
        return row ? { cookie: row.cookie as string, crumb: row.crumb as string } : null;
    } catch { return null; }
}

export async function setStoredYahooAuth(cookie: string, crumb: string): Promise<void> {
    if (!(await ensureInit())) return;
    const c = getClient();
    if (!c) return;
    try {
        await c.execute({
            sql: `INSERT INTO yahoo_auth (id, cookie, crumb, updated_at) VALUES (1, ?, ?, ?)
                  ON CONFLICT (id) DO UPDATE SET cookie = excluded.cookie, crumb = excluded.crumb, updated_at = excluded.updated_at`,
            args: [cookie, crumb, new Date().toISOString()],
        });
    } catch (err) {
        console.warn('[marketDataDb] Write yahoo_auth failed:', err);
    }
}

export async function clearStoredYahooAuth(): Promise<void> {
    if (!(await ensureInit())) return;
    const c = getClient();
    if (!c) return;
    try { await c.execute('DELETE FROM yahoo_auth WHERE id = 1'); } catch { /* ignore */ }
}

export async function getCachedHistoricalFxRates(pair: string): Promise<Record<DateString, number>> {
    await loadFxForPair(pair);
    const map = _memFx.get(pair);
    return map ? Object.fromEntries(map) : {};
}

/** Bulk-insert (or update) FX rates for a pair. */
export async function setCachedHistoricalFxRates(pair: string, rates: Record<DateString, number>): Promise<void> {
    const entries = Object.entries(rates);
    if (entries.length === 0) return;

    const map = _memFx.get(pair) ?? new Map<DateString, number>();
    for (const [date, rate] of entries) map.set(date, rate);
    _memFx.set(pair, map);
    _loadedFxKeys.add(pair);

    if (!(await ensureInit())) return;
    const c = getClient();
    if (!c) return;
    try {
        await c.batch(
            entries.map(([date, rate]) => ({
                sql: `INSERT INTO market_fx_rates (pair, rate_date, rate)
                      VALUES (?, ?, ?)
                      ON CONFLICT (pair, rate_date) DO UPDATE SET rate = excluded.rate`,
                args: [pair, date, rate],
            })),
            'write',
        );
    } catch (err) {
        console.warn(`[marketDataDb] Write FX failed for ${pair}:`, err);
    }
}

/** Look up a single FX rate for a specific date, or forward-fill from earlier dates. */
export async function getCachedFxRateOnOrBefore(pair: string, date: DateString): Promise<number | null> {
    await loadFxForPair(pair);
    const map = _memFx.get(pair);
    if (!map || map.size === 0) return null;
    return forwardFillLookup(map, date);
}

/** Return all cached dividend events for a ticker as { exDate: { amount, currency } }. */
export async function getCachedDividendEvents(ticker: string): Promise<Record<DateString, DividendRow>> {
    await loadDividendsForTicker(ticker);
    const map = _memDividends.get(ticker);
    return map ? Object.fromEntries(map) : {};
}

/** When the dividend series for a ticker was last refreshed from upstream. */
export async function getDividendRefreshedAt(ticker: string): Promise<Date | null> {
    if (!(await ensureInit())) return null;
    const c = getClient();
    if (!c) return null;
    try {
        const rows = await c.execute({
            sql: 'SELECT refreshed_at FROM dividend_refresh WHERE ticker = ?',
            args: [ticker],
        });
        const ts = rows.rows[0]?.refreshed_at as string | undefined;
        return ts ? new Date(ts) : null;
    } catch (err) {
        console.warn(`[marketDataDb] Read dividend_refresh failed for ${ticker}:`, err);
        return null;
    }
}

/**
 * Bulk-insert (or update) dividend events for a ticker. Dates use YYYY-MM-DD.
 * Always stamps `dividend_refresh` for the ticker — even when `events` is
 * empty — so a "this ticker pays no dividends" answer doesn't trigger a
 * refetch on every request.
 */
export async function setCachedDividendEvents(ticker: string, events: Record<DateString, DividendRow>): Promise<void> {
    const entries = Object.entries(events);

    if (entries.length > 0) {
        const map = _memDividends.get(ticker) ?? new Map<DateString, DividendRow>();
        for (const [date, ev] of entries) map.set(date, ev);
        _memDividends.set(ticker, map);
        _loadedDividendKeys.add(ticker);
    }

    if (!(await ensureInit())) return;
    const c = getClient();
    if (!c) return;
    try {
        const stmts: { sql: string; args: (string | number)[] }[] = entries.map(([date, ev]) => ({
            sql: `INSERT INTO dividend_events (ticker, ex_date, amount_per_share, currency)
                  VALUES (?, ?, ?, ?)
                  ON CONFLICT (ticker, ex_date) DO UPDATE SET
                    amount_per_share = excluded.amount_per_share,
                    currency = excluded.currency`,
            args: [ticker, date, ev.amount, ev.currency],
        }));
        stmts.push({
            sql: `INSERT INTO dividend_refresh (ticker, refreshed_at)
                  VALUES (?, ?)
                  ON CONFLICT (ticker) DO UPDATE SET refreshed_at = excluded.refreshed_at`,
            args: [ticker, new Date().toISOString()],
        });
        await c.batch(stmts, 'write');
    } catch (err) {
        console.warn(`[marketDataDb] Write dividends failed for ${ticker}:`, err);
    }
}
