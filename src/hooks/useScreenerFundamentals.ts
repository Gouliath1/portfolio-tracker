'use client';

import { useCallback, useRef, useState } from 'react';
import type { StockFundamentals } from '../types/screener';

export type FundEntry =
    | { status: 'loading' }
    | { status: 'done'; data: StockFundamentals; ratiosPending?: boolean; ratiosError?: string; fetchedAt?: string; ratiosFetchedAt?: string | null }
    | { status: 'error'; reason?: string };

export interface LoadProgress { done: number; total: number; }

export interface FundamentalsApi {
    map: Map<string, FundEntry>;
    /** Force a fresh fetch of one symbol (both tiers), bypassing caches. */
    refresh: (symbol: string) => void;
    /** Paced, price-only bulk load of the given symbols (the "Fetch prices" action). */
    loadMany: (symbols: string[]) => void;
    /** Restore symbols from the DB cache only — no upstream calls. */
    loadCached: (symbols: string[]) => void;
    /** Non-null while a bulk load is in progress. */
    progress: LoadProgress | null;
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

const BULK_CONCURRENCY = 3;
const BULK_GAP_MS = 120;

interface FetchOpts { fresh?: boolean; tier?: 'price'; }

// Module-level store — survives component unmount/remount (page navigation).
// When the user navigates away and returns the map already has data, and
// cacheChecked prevents re-probing the DB for symbols we already know about.
const _store = {
    map: new Map<string, FundEntry>(),
    requested: new Set<string>(),
    cacheChecked: new Set<string>(),
};

export function useScreenerFundamentals(): FundamentalsApi {
    // Seed from the persisted store so remounts see existing data immediately.
    const [map, _setMap] = useState<Map<string, FundEntry>>(() => new Map(_store.map));
    const [progress, setProgress] = useState<LoadProgress | null>(null);

    // Refs point directly to the module-level sets — they survive remounts.
    const requested = useRef(_store.requested);
    const cacheChecked = useRef(_store.cacheChecked);

    /** Write one entry to both React state and the persistent store. */
    const setEntry = useCallback((symbol: string, entry: FundEntry) => {
        _store.map.set(symbol, entry);
        _setMap(prev => new Map(prev).set(symbol, entry));
    }, []);

    const fetchOne = useCallback(async (symbol: string, opts: FetchOpts = {}) => {
        const params = new URLSearchParams({ symbol });
        if (opts.fresh) params.set('fresh', '1');
        if (opts.tier) params.set('tier', opts.tier);
        try {
            const res = await fetch(`/api/screener/quote?${params}`, opts.fresh ? { cache: 'no-store' } : undefined);
            if (!res.ok) {
                let reason = `HTTP ${res.status}`;
                try { const body = await res.json(); if (body?.error) reason = body.error; } catch { /* ignore */ }
                throw new Error(reason);
            }
            const data = (await res.json()) as StockFundamentals & {
                ratiosPending?: boolean; ratiosError?: string;
                fetchedAt?: string; ratiosFetchedAt?: string | null;
            };
            setEntry(symbol, {
                status: 'done', data,
                ratiosPending: data.ratiosPending,
                ratiosError: data.ratiosError,
                fetchedAt: data.fetchedAt,
                ratiosFetchedAt: data.ratiosFetchedAt,
            });
        } catch (e) {
            requested.current.delete(symbol);
            setEntry(symbol, { status: 'error', reason: e instanceof Error ? e.message : undefined });
        }
    }, [setEntry]);

    const loadMany = useCallback((symbols: string[]) => {
        if (symbols.length === 0) return;
        symbols.forEach(s => requested.current.add(s));

        // Mark visible rows as loading so the UI responds immediately.
        _setMap(prev => {
            const next = new Map(prev);
            symbols.forEach(s => {
                const loading: FundEntry = { status: 'loading' };
                next.set(s, loading);
                _store.map.set(s, loading);
            });
            return next;
        });

        const total = symbols.length;
        let done = 0;
        setProgress({ done, total });

        let idx = 0;
        const worker = async () => {
            while (idx < symbols.length) {
                const sym = symbols[idx++];
                await fetchOne(sym);
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
        setEntry(symbol, { status: 'loading' });
        void fetchOne(symbol, { fresh: true });
    }, [fetchOne, setEntry]);

    // Restore what's already in the DB cache — no upstream calls, no backfill.
    // Ratios that are missing (ratiosPending=true) are left as-is; the user
    // triggers a full refresh explicitly via Fetch prices or ⟳ per row.
    const loadCached = useCallback((symbols: string[]) => {
        const toCheck = symbols.filter(s => !requested.current.has(s) && !cacheChecked.current.has(s));
        if (toCheck.length === 0) return;
        toCheck.forEach(s => cacheChecked.current.add(s));

        void (async () => {
            await Promise.all(toCheck.map(async symbol => {
                try {
                    const res = await fetch(`/api/screener/quote?symbol=${encodeURIComponent(symbol)}&cachedOnly=1`);
                    if (res.status === 204 || !res.ok) return; // not in cache — leave as unloaded
                    const data = (await res.json()) as StockFundamentals & {
                        ratiosPending?: boolean; fetchedAt?: string; ratiosFetchedAt?: string | null;
                    };
                    requested.current.add(symbol);
                    setEntry(symbol, {
                        status: 'done', data,
                        ratiosPending: data.ratiosPending,
                        fetchedAt: data.fetchedAt,
                        ratiosFetchedAt: data.ratiosFetchedAt,
                    });
                } catch { /* leave unloaded */ }
            }));
        })();
    }, [setEntry]);

    return { map, refresh, loadMany, loadCached, progress };
}
