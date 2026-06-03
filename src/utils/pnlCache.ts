/**
 * Client-side cache for computed PortfolioSummary.
 *
 * Why: positions don't change between page reloads, and most fields (cost,
 * realized P&L, transaction FX rates) are static once recorded. The only
 * things that move intra-day are current prices and current FX rates. So we
 * paint the cached summary immediately, then recompute in the background and
 * overwrite — stale-while-revalidate semantics.
 *
 * Cache key: hash of the positions + base currency. Any add/sell/edit
 * invalidates the entry naturally because the hash changes.
 */

import { PortfolioSummary, RawPosition, Position } from '@portfolio/types';
import type { HistoricalSnapshot } from '../lib/core/historicalPortfolioCalculations';

// Bumped v2→v3 to invalidate caches written before the currency-desync fix:
// pre-fix chart/daily snapshots stored a cost/value computed in a stale base
// currency, and the same-day cache short-circuit would otherwise keep serving
// them. A new prefix forces a clean recompute for all clients.
const VERSION = 'v3';
const KEY_PREFIX = `pt_pnl_${VERSION}_`;
const CHART_KEY_PREFIX = `pt_chart_${VERSION}_`;
const DAILY_KEY_PREFIX = `pt_daily_${VERSION}_`;
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7; // 7 days — anything older recomputes

type Stored = {
    summary: PortfolioSummary;
    storedAt: number;     // epoch ms
    storedDate: string;   // local YYYY-MM-DD when stored — used for "is from today" check
};

export type CachedRead = {
    summary: PortfolioSummary;
    fromToday: boolean;
};

function localDateStr(d = new Date()): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// Fast non-crypto hash (cyrb53) — base-36 string keeps localStorage keys short.
function hash(str: string): string {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function buildKey(positions: RawPosition[], baseCurrency: string): string {
    // Only the fields that affect the computed P&L go into the hash. Stable
    // ordering is already guaranteed by deriveLotsFromTransactions.
    const sig = positions.map(p => [
        p.transactionDate, p.ticker, p.quantity, p.costPerUnit,
        p.transactionCcy, p.stockCcy, p.saleDate ?? '', p.salePricePerUnit ?? 0, p.saleCcy ?? '',
    ]);
    return `${KEY_PREFIX}${baseCurrency}_${hash(JSON.stringify(sig))}`;
}

// A null currentPrice on any open lot means we have a partial snapshot —
// the dashboard would render "Updating…" cards if it paints from it. We
// never want to serve those: discard them on read and refuse to write them
// on save. The next compute will overwrite with a complete snapshot.
function isCompleteSummary(summary: PortfolioSummary): boolean {
    return !summary.positions.some(p => p.currentPrice === null);
}

export function readCachedSummary(positions: RawPosition[], baseCurrency: string): CachedRead | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(buildKey(positions, baseCurrency));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Stored;
        if (!parsed.summary || typeof parsed.storedAt !== 'number') return null;
        if (Date.now() - parsed.storedAt > MAX_AGE_MS) return null;
        if (!isCompleteSummary(parsed.summary)) return null;
        return { summary: parsed.summary, fromToday: parsed.storedDate === localDateStr() };
    } catch {
        return null;
    }
}

export function writeCachedSummary(positions: RawPosition[], baseCurrency: string, summary: PortfolioSummary): void {
    if (typeof window === 'undefined') return;
    if (!isCompleteSummary(summary)) return;
    try {
        const stored: Stored = { summary, storedAt: Date.now(), storedDate: localDateStr() };
        localStorage.setItem(buildKey(positions, baseCurrency), JSON.stringify(stored));
    } catch {
        // Quota or serialization error — caching is best-effort.
    }
}

// ── Chart snapshot cache ────────────────────────────────────────────────────
//
// Same shape and rationale as the PnL summary cache, but per-timeline. The
// chart recomputes a full historical series each render which is expensive
// (N tickers × M dates of price lookups + FX conversions). For same-day
// reloads with unchanged positions, the series is identical to last time.

type StoredChart = {
    snapshots: HistoricalSnapshot[];
    storedAt: number;
    storedDate: string;
};

export type CachedChartRead = {
    snapshots: HistoricalSnapshot[];
    fromToday: boolean;
};

function buildChartKey(positions: Position[], baseCurrency: string, timeline: string): string {
    // Position has the same identity fields as RawPosition; hashing the same
    // tuple keeps the chart cache aligned with the PnL cache invariants —
    // adding/selling positions invalidates both naturally.
    const sig = positions.map(p => [
        p.transactionDate, p.ticker, p.quantity, p.costPerUnit,
        p.transactionCcy, p.stockCcy, p.saleDate ?? '', p.salePricePerUnit ?? 0, p.saleCcy ?? '',
    ]);
    return `${CHART_KEY_PREFIX}${baseCurrency}_${timeline}_${hash(JSON.stringify(sig))}`;
}

export function readCachedChart(positions: Position[], baseCurrency: string, timeline: string): CachedChartRead | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(buildChartKey(positions, baseCurrency, timeline));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as StoredChart;
        if (!Array.isArray(parsed.snapshots) || typeof parsed.storedAt !== 'number') return null;
        if (Date.now() - parsed.storedAt > MAX_AGE_MS) return null;
        return { snapshots: parsed.snapshots, fromToday: parsed.storedDate === localDateStr() };
    } catch {
        return null;
    }
}

export function writeCachedChart(positions: Position[], baseCurrency: string, timeline: string, snapshots: HistoricalSnapshot[]): void {
    if (typeof window === 'undefined') return;
    try {
        const stored: StoredChart = { snapshots, storedAt: Date.now(), storedDate: localDateStr() };
        localStorage.setItem(buildChartKey(positions, baseCurrency, timeline), JSON.stringify(stored));
    } catch {
        // Quota or serialization error — caching is best-effort.
    }
}

export function clearChartCache(): void {
    if (typeof window === 'undefined') return;
    for (const key of Object.keys(localStorage)) {
        if (key.startsWith(CHART_KEY_PREFIX)) localStorage.removeItem(key);
    }
}

// ── Daily PnL cache (yesterday's-close snapshot) ────────────────────────────
//
// useDailyPnl computes a single snapshot at yesterday's business-day close.
// That value only changes once per day, so we cache the raw snapshot value
// keyed by (positions, currency). The "Today's P&L" delta is recomputed from
// it + the live currentValue.

type StoredDaily = {
    yesterdayValue: number;
    storedAt: number;
    storedDate: string;
};

export type CachedDailyRead = {
    yesterdayValue: number;
    fromToday: boolean;
};

function buildDailyKey(positions: Position[], baseCurrency: string): string {
    const sig = positions.map(p => [
        p.transactionDate, p.ticker, p.quantity, p.costPerUnit,
        p.transactionCcy, p.stockCcy, p.saleDate ?? '', p.salePricePerUnit ?? 0, p.saleCcy ?? '',
    ]);
    return `${DAILY_KEY_PREFIX}${baseCurrency}_${hash(JSON.stringify(sig))}`;
}

export function readCachedDailyValue(positions: Position[], baseCurrency: string): CachedDailyRead | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(buildDailyKey(positions, baseCurrency));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as StoredDaily;
        if (typeof parsed.yesterdayValue !== 'number' || typeof parsed.storedAt !== 'number') return null;
        if (Date.now() - parsed.storedAt > MAX_AGE_MS) return null;
        return { yesterdayValue: parsed.yesterdayValue, fromToday: parsed.storedDate === localDateStr() };
    } catch {
        return null;
    }
}

export function writeCachedDailyValue(positions: Position[], baseCurrency: string, yesterdayValue: number): void {
    if (typeof window === 'undefined') return;
    try {
        const stored: StoredDaily = { yesterdayValue, storedAt: Date.now(), storedDate: localDateStr() };
        localStorage.setItem(buildDailyKey(positions, baseCurrency), JSON.stringify(stored));
    } catch {
        // Quota or serialization error — caching is best-effort.
    }
}
