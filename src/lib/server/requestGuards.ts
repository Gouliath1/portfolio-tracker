/**
 * Shared request guards for the market-data API routes.
 *
 * These routes are public and each unvalidated request can fan out into Yahoo
 * fetches and Turso writes, so every one of them goes through the same
 * validation, caps and cache headers. The limiters here are best-effort,
 * in-process: serverless instances don't share memory, so the real
 * rate limits belong at the edge (Vercel Firewall). These bound a single
 * instance and make accidental loops cheap.
 */

import { NextResponse } from 'next/server';

// ── Validation ──────────────────────────────────────────────────────────────

/** Tickers, indices, crypto and FX symbols: `7203.T`, `^N225`, `BTC-USD`, `EURUSD=X`. */
const SYMBOL_RE = /^[A-Za-z0-9.^=\-]{1,20}$/;
const PAIR_RE = /^[A-Za-z]{6}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const RANGE_RE = /^(\d{1,3}[dy]|max)$/;

export const MAX_SYMBOLS_PER_REQUEST = 100;
export const MAX_DATES_PER_REQUEST = 4000;

export const isValidSymbol = (s: unknown): s is string => typeof s === 'string' && SYMBOL_RE.test(s);
export const isValidPair = (s: unknown): s is string => typeof s === 'string' && PAIR_RE.test(s);
export const isValidRange = (s: unknown): s is string => typeof s === 'string' && RANGE_RE.test(s);

export interface ParsedSymbols {
    symbols: string[];
    /** True when the list was longer than `max` or contained a malformed symbol. */
    rejected: boolean;
}

/** Parse `A,B,C`: trim, dedupe, validate each, and refuse lists over `max`. */
export function parseSymbols(raw: string | null | undefined, max = MAX_SYMBOLS_PER_REQUEST): ParsedSymbols {
    if (!raw) return { symbols: [], rejected: false };
    const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
    const unique = [...new Set(parts)];
    if (unique.length > max || unique.some(s => !isValidSymbol(s))) {
        return { symbols: [], rejected: true };
    }
    return { symbols: unique, rejected: false };
}

/**
 * Like `parseSymbols`, but malformed entries are set aside instead of failing
 * the whole request — one odd ticker in a portfolio must not blank out every
 * other price. Over-cap lists are still rejected.
 */
export function parseSymbolsLenient(
    raw: string | null | undefined,
    max = MAX_SYMBOLS_PER_REQUEST,
): { symbols: string[]; invalid: string[]; rejected: boolean } {
    if (!raw) return { symbols: [], invalid: [], rejected: false };
    const unique = [...new Set(raw.split(',').map(s => s.trim()).filter(Boolean))];
    if (unique.length > max) return { symbols: [], invalid: [], rejected: true };
    return {
        symbols: unique.filter(isValidSymbol),
        invalid: unique.filter(s => !isValidSymbol(s)),
        rejected: false,
    };
}

export function parseDates(raw: string | null | undefined, max = MAX_DATES_PER_REQUEST): string[] | null {
    if (!raw) return [];
    const dates = raw.split(',').filter(Boolean);
    if (dates.length > max || dates.some(d => !DATE_RE.test(d))) return null;
    return dates;
}

export const badRequest = (error: string) => NextResponse.json({ error }, { status: 400 });

// ── Kill switch ─────────────────────────────────────────────────────────────

/** Flip `API_EXPENSIVE_DISABLED=1` in the Vercel dashboard to stop upstream fetches instantly. */
export const expensiveRoutesDisabled = (): boolean => process.env.API_EXPENSIVE_DISABLED === '1';

export const disabledResponse = () => NextResponse.json(
    { error: 'Temporarily disabled to protect service quotas. Cached data is still served where available.' },
    { status: 503, headers: { 'Retry-After': '300', 'Cache-Control': 'no-store' } },
);

// ── Cache headers ───────────────────────────────────────────────────────────

/** CDN-cacheable: shared by every user, which is the point (one fetch serves all). */
export const cdnCache = (sMaxAge: number, staleWhileRevalidate = sMaxAge * 5) => ({
    'Cache-Control': `public, s-maxage=${sMaxAge}, stale-while-revalidate=${staleWhileRevalidate}`,
});
export const NO_STORE = { 'Cache-Control': 'no-store' } as const;

// ── Limiters (best-effort, per instance) ────────────────────────────────────

export const clientIp = (request: Request): string =>
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';

const windows = new Map<string, { count: number; resetAt: number }>();

/** True when `key` has exceeded `limit` hits inside the current window. */
export function overLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
    const entry = windows.get(key);
    if (!entry || entry.resetAt <= now) {
        if (windows.size > 5000) windows.clear();
        windows.set(key, { count: 1, resetAt: now + windowMs });
        return false;
    }
    entry.count += 1;
    return entry.count > limit;
}

const lastForced = new Map<string, number>();

/**
 * Throttle for "bypass the cache" requests. `fresh=1` used to let any visitor
 * force an upstream fetch for any symbol, any number of times; now a forced
 * refresh of a given key is honoured at most once per cooldown, and every
 * other request in that window is served from cache. This is what keeps many
 * users clicking Refresh from multiplying into many Yahoo calls and DB writes.
 */
export function allowForcedRefresh(key: string, cooldownMs: number, now = Date.now()): boolean {
    const last = lastForced.get(key);
    if (last !== undefined && now - last < cooldownMs) return false;
    if (lastForced.size > 20000) lastForced.clear();
    lastForced.set(key, now);
    return true;
}

export function resetGuardsForTests(): void {
    windows.clear();
    lastForced.clear();
}
