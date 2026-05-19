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

import { PortfolioSummary, RawPosition } from '@portfolio/types';

const VERSION = 'v1';
const KEY_PREFIX = `pt_pnl_${VERSION}_`;
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

export function readCachedSummary(positions: RawPosition[], baseCurrency: string): CachedRead | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(buildKey(positions, baseCurrency));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Stored;
        if (!parsed.summary || typeof parsed.storedAt !== 'number') return null;
        if (Date.now() - parsed.storedAt > MAX_AGE_MS) return null;
        return { summary: parsed.summary, fromToday: parsed.storedDate === localDateStr() };
    } catch {
        return null;
    }
}

export function writeCachedSummary(positions: RawPosition[], baseCurrency: string, summary: PortfolioSummary): void {
    if (typeof window === 'undefined') return;
    try {
        const stored: Stored = { summary, storedAt: Date.now(), storedDate: localDateStr() };
        localStorage.setItem(buildKey(positions, baseCurrency), JSON.stringify(stored));
    } catch {
        // Quota or serialization error — caching is best-effort.
    }
}
