'use client';

import { useCallback, useRef, useState } from 'react';
import type { StockFundamentals } from '../types/screener';

export type FundEntry =
    | { status: 'loading' }
    | { status: 'done'; data: StockFundamentals; ratiosPending?: boolean; ratiosError?: string }
    | { status: 'error'; reason?: string };

export interface LoadProgress { done: number; total: number; }

export interface FundamentalsApi {
    map: Map<string, FundEntry>;
    /** Force a fresh fetch of one symbol (both tiers), bypassing caches. */
    refresh: (symbol: string) => void;
    /** Paced, price-only bulk load of the given symbols (the "Load page" action). */
    loadMany: (symbols: string[]) => void;
    /** Restore symbols from the DB cache only (no Yahoo) — used on page load. */
    loadCached: (symbols: string[]) => void;
    /** Non-null while a bulk load is in progress. */
    progress: LoadProgress | null;
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// Low concurrency + a small gap so a bulk load never bursts Yahoo — bursting 50
// at once throttled even the no-auth chart endpoint (and broke the chart modal).
const BULK_CONCURRENCY = 3;
const BULK_GAP_MS = 120;

interface FetchOpts { fresh?: boolean; tier?: 'price'; }

/**
 * Fetches screener fundamentals ON DEMAND (never auto on navigation). Bulk loads
 * ("Load page") are price-only and paced; ratios (crumb-gated) are fetched only
 * per-row via refresh, keeping getcrumb usage tiny. Each request hits
 * /api/screener/quote (DB-cached + Cache-Control).
 */
export function useScreenerFundamentals(): FundamentalsApi {
    const [map, setMap] = useState<Map<string, FundEntry>>(new Map());
    const [progress, setProgress] = useState<LoadProgress | null>(null);
    // Symbols already requested (any status) — avoids duplicate in-flight fetches.
    const requested = useRef<Set<string>>(new Set());
    // Symbols already checked against the DB cache — avoids re-probing every render.
    const cacheChecked = useRef<Set<string>>(new Set());

    const fetchOne = useCallback(async (symbol: string, opts: FetchOpts = {}) => {
        const params = new URLSearchParams({ symbol });
        if (opts.fresh) params.set('fresh', '1');   // bypass server DB cache (force Yahoo)
        if (opts.tier) params.set('tier', opts.tier); // 'price' → skip crumb-gated ratios
        try {
            const res = await fetch(`/api/screener/quote?${params}`, opts.fresh ? { cache: 'no-store' } : undefined);
            if (!res.ok) {
                let reason = `HTTP ${res.status}`;
                try { const body = await res.json(); if (body?.error) reason = body.error; } catch { /* ignore */ }
                throw new Error(reason);
            }
            const data = (await res.json()) as StockFundamentals & { ratiosPending?: boolean; ratiosError?: string };
            setMap(prev => new Map(prev).set(symbol, { status: 'done', data, ratiosPending: data.ratiosPending, ratiosError: data.ratiosError }));
        } catch (e) {
            requested.current.delete(symbol); // allow a later retry
            setMap(prev => new Map(prev).set(symbol, { status: 'error', reason: e instanceof Error ? e.message : undefined }));
        }
    }, []);

    const loadMany = useCallback((symbols: string[]) => {
        // Always fetch all page symbols on explicit user action — don't skip symbols
        // that were previously loaded from cache, since the user is explicitly asking
        // for a fresh price fetch (e.g. after navigating to a new page).
        const toFetch = symbols;
        if (toFetch.length === 0) return;
        toFetch.forEach(s => requested.current.add(s));
        setMap(prev => {
            const next = new Map(prev);
            toFetch.forEach(s => next.set(s, { status: 'loading' }));
            return next;
        });

        const total = toFetch.length;
        let done = 0;
        setProgress({ done, total });

        // Bounded worker pool — paced to avoid hitting J-Quants / Twelve Data too fast.
        let idx = 0;
        const worker = async () => {
            while (idx < toFetch.length) {
                const symbol = toFetch[idx++];
                await fetchOne(symbol);
                done += 1;
                setProgress({ done, total });
                await delay(BULK_GAP_MS);
            }
        };
        void Promise.all(Array.from({ length: Math.min(BULK_CONCURRENCY, total) }, worker))
            .finally(() => setProgress(null));
    }, [fetchOne]);

    const refresh = useCallback((symbol: string) => {
        requested.current.add(symbol);
        setMap(prev => new Map(prev).set(symbol, { status: 'loading' }));
        void fetchOne(symbol, { fresh: true });
    }, [fetchOne]);

    // Restore from DB cache. Rows not in the cache stay unloaded.
    // If a cached row has ratiosPending (price cached but no ratios yet), silently
    // background-fetch the ratios so the page restores fully after a reload.
    const loadCached = useCallback((symbols: string[]) => {
        const toCheck = symbols.filter(s => !requested.current.has(s) && !cacheChecked.current.has(s));
        if (toCheck.length === 0) return;
        toCheck.forEach(s => cacheChecked.current.add(s));

        const ratiosPending: string[] = [];

        void (async () => {
            await Promise.all(toCheck.map(async symbol => {
                try {
                    const res = await fetch(`/api/screener/quote?symbol=${encodeURIComponent(symbol)}&cachedOnly=1`);
                    if (res.status === 204 || !res.ok) return;
                    const data = (await res.json()) as StockFundamentals & { ratiosPending?: boolean };
                    requested.current.add(symbol);
                    setMap(prev => new Map(prev).set(symbol, { status: 'done', data, ratiosPending: data.ratiosPending }));
                    if (data.ratiosPending) ratiosPending.push(symbol);
                } catch { /* leave unloaded */ }
            }));

            // Silently back-fill ratios for any symbol that only had price in the DB.
            // Paced so we don't burst J-Quants / Twelve Data on every page load.
            if (ratiosPending.length === 0) return;
            let idx = 0;
            const worker = async () => {
                while (idx < ratiosPending.length) {
                    const sym = ratiosPending[idx++];
                    await fetchOne(sym);
                    await delay(BULK_GAP_MS);
                }
            };
            await Promise.all(Array.from({ length: Math.min(BULK_CONCURRENCY, ratiosPending.length) }, worker));
        })();
    }, [fetchOne]);

    return { map, refresh, loadMany, loadCached, progress };
}
