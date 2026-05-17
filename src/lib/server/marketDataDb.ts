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
import { dirname } from 'path';
import { mkdirSync } from 'fs';

type DateString = string; // YYYY-MM-DD

const DEFAULT_LOCAL_PATH = './data/marketCache.db';

let _client: Client | null = null;
let _initPromise: Promise<void> | null = null;

function getClient(): Client {
    if (_client) return _client;

    const tursoUrl = process.env.TURSO_DATABASE_URL;
    const tursoToken = process.env.TURSO_AUTH_TOKEN;

    if (tursoUrl && tursoToken) {
        _client = createClient({ url: tursoUrl, authToken: tursoToken });
    } else {
        const path = process.env.MARKET_DB_PATH ?? DEFAULT_LOCAL_PATH;
        try { mkdirSync(dirname(path), { recursive: true }); } catch { /* exists */ }
        _client = createClient({ url: `file:${path}` });
    }
    return _client;
}

async function ensureInit(): Promise<void> {
    if (_initPromise) return _initPromise;
    _initPromise = (async () => {
        const c = getClient();
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
    })();
    return _initPromise;
}

// ── In-memory layer ──────────────────────────────────────────────────────────
//
// Loaded per-ticker on first read; populated by both DB hits and Yahoo writes.
// The DB is still the source of truth — this just avoids round-trips inside a
// single function instance.

const _memPrices = new Map<string, Map<DateString, number>>();
const _memFx = new Map<string, Map<DateString, number>>();
const _loadedPriceKeys = new Set<string>();
const _loadedFxKeys = new Set<string>();

async function loadPricesForTicker(ticker: string): Promise<void> {
    if (_loadedPriceKeys.has(ticker)) return;
    await ensureInit();
    const rows = await getClient().execute({
        sql: 'SELECT price_date, close_price FROM security_prices WHERE ticker = ?',
        args: [ticker],
    });
    const map = _memPrices.get(ticker) ?? new Map<DateString, number>();
    for (const row of rows.rows) {
        map.set(row.price_date as string, Number(row.close_price));
    }
    _memPrices.set(ticker, map);
    _loadedPriceKeys.add(ticker);
}

async function loadFxForPair(pair: string): Promise<void> {
    if (_loadedFxKeys.has(pair)) return;
    await ensureInit();
    const rows = await getClient().execute({
        sql: 'SELECT rate_date, rate FROM market_fx_rates WHERE pair = ?',
        args: [pair],
    });
    const map = _memFx.get(pair) ?? new Map<DateString, number>();
    for (const row of rows.rows) {
        map.set(row.rate_date as string, Number(row.rate));
    }
    _memFx.set(pair, map);
    _loadedFxKeys.add(pair);
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
    await ensureInit();

    // Update in-memory layer.
    const map = _memPrices.get(ticker) ?? new Map<DateString, number>();
    for (const [date, price] of entries) map.set(date, price);
    _memPrices.set(ticker, map);
    _loadedPriceKeys.add(ticker);

    // Batch upsert. SQLite supports ON CONFLICT … DO UPDATE since 3.24.
    const c = getClient();
    await c.batch(
        entries.map(([date, price]) => ({
            sql: `INSERT INTO security_prices (ticker, price_date, close_price)
                  VALUES (?, ?, ?)
                  ON CONFLICT (ticker, price_date) DO UPDATE SET close_price = excluded.close_price`,
            args: [ticker, date, price],
        })),
        'write',
    );
}

/** Return all cached FX rates for a pair (e.g. "USDJPY") as { date: rate }. */
export async function getCachedHistoricalFxRates(pair: string): Promise<Record<DateString, number>> {
    await loadFxForPair(pair);
    const map = _memFx.get(pair);
    return map ? Object.fromEntries(map) : {};
}

/** Bulk-insert (or update) FX rates for a pair. */
export async function setCachedHistoricalFxRates(pair: string, rates: Record<DateString, number>): Promise<void> {
    const entries = Object.entries(rates);
    if (entries.length === 0) return;
    await ensureInit();

    const map = _memFx.get(pair) ?? new Map<DateString, number>();
    for (const [date, rate] of entries) map.set(date, rate);
    _memFx.set(pair, map);
    _loadedFxKeys.add(pair);

    const c = getClient();
    await c.batch(
        entries.map(([date, rate]) => ({
            sql: `INSERT INTO market_fx_rates (pair, rate_date, rate)
                  VALUES (?, ?, ?)
                  ON CONFLICT (pair, rate_date) DO UPDATE SET rate = excluded.rate`,
            args: [pair, date, rate],
        })),
        'write',
    );
}

/** Look up a single FX rate for a specific date, or forward-fill from earlier dates. */
export async function getCachedFxRateOnOrBefore(pair: string, date: DateString): Promise<number | null> {
    await loadFxForPair(pair);
    const map = _memFx.get(pair);
    if (!map || map.size === 0) return null;
    if (map.has(date)) return map.get(date)!;

    // Forward-fill: find the latest date <= target.
    let bestDate: DateString | null = null;
    for (const d of map.keys()) {
        if (d <= date && (bestDate === null || d > bestDate)) bestDate = d;
    }
    return bestDate ? map.get(bestDate)! : null;
}
