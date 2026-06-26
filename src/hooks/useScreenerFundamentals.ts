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
    refresh: (symbol: string) => void;
    loadMany: (symbols: string[]) => void;
    loadCached: (symbols: string[]) => void;
    progress: LoadProgress | null;
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
const BULK_CONCURRENCY = 3;
const BULK_GAP_MS = 120;
interface FetchOpts { fresh?: boolean; }

// ── localStorage persistence ──────────────────────────────────────────────
// Key is versioned so stale formats are discarded automatically.
const LS_KEY = 'screener:fundMap:v2';
// Drop entries older than 30 days from localStorage (they'll re-fetch on demand).
const LS_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// Module-level store — in-memory across client-side navigations.
// Seeded from localStorage on first client render so hard refreshes also restore.
const _store = {
    map: new Map<string, FundEntry>(),
    requested: new Set<string>(),
    cacheChecked: new Set<string>(),
};

// Lazy localStorage init — safe for SSR (typeof window guard).
let _lsInitDone = false;
function ensureLsInit(): void {
    if (_lsInitDone || typeof window === 'undefined') return;
    _lsInitDone = true;
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return;
        const entries = JSON.parse(raw) as [string, FundEntry][];
        const now = Date.now();
        for (const [sym, entry] of entries) {
            if (entry.status === 'done' && entry.fetchedAt) {
                if (now - new Date(entry.fetchedAt).getTime() < LS_MAX_AGE_MS) {
                    _store.map.set(sym, entry);
                    _store.requested.add(sym);
                    _store.cacheChecked.add(sym);
                }
            }
        }
    } catch { /* ignore corrupt/missing data */ }
}

// Debounced save — batches rapid setEntry calls into one write.
let _saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleLsSave(): void {
    if (typeof window === 'undefined') return;
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => {
        _saveTimer = null;
        try {
            const entries = Array.from(_store.map.entries()).filter(([, e]) => e.status === 'done');
            localStorage.setItem(LS_KEY, JSON.stringify(entries));
        } catch { /* ignore quota errors */ }
    }, 500);
}

// ─────────────────────────────────────────────────────────────────────────

export function useScreenerFundamentals(): FundamentalsApi {
    // Hydrate from localStorage before the first render.
    ensureLsInit();

    const [map, _setMap] = useState<Map<string, FundEntry>>(() => new Map(_store.map));
    const [progress, setProgress] = useState<LoadProgress | null>(null);

    const requested = useRef(_store.requested);
    const cacheChecked = useRef(_store.cacheChecked);

    /** Write one entry to in-memory store, React state, and localStorage. */
    const setEntry = useCallback((symbol: string, entry: FundEntry) => {
        _store.map.set(symbol, entry);
        _setMap(prev => new Map(prev).set(symbol, entry));
        if (entry.status === 'done') scheduleLsSave();
    }, []);

    const fetchOne = useCallback(async (symbol: string, opts: FetchOpts = {}) => {
        const params = new URLSearchParams({ symbol });
        if (opts.fresh) params.set('fresh', '1');
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

    const loadCached = useCallback((symbols: string[]) => {
        const toCheck = symbols.filter(s => !requested.current.has(s) && !cacheChecked.current.has(s));
        if (toCheck.length === 0) return;
        // Mark in-flight to prevent duplicate concurrent requests.
        toCheck.forEach(s => cacheChecked.current.add(s));

        const CHUNK = 200;
        const chunks: string[][] = [];
        for (let i = 0; i < toCheck.length; i += CHUNK) chunks.push(toCheck.slice(i, i + CHUNK));

        void (async () => {
            await Promise.all(chunks.map(async chunk => {
                try {
                    const res = await fetch(`/api/screener/quotes?symbols=${chunk.map(encodeURIComponent).join(',')}`);
                    if (!res.ok) {
                        // Server error — unblock so fallback can retry.
                        chunk.forEach(s => cacheChecked.current.delete(s));
                        return;
                    }
                    const batch = await res.json() as Record<string, StockFundamentals & {
                        ratiosPending?: boolean; fetchedAt?: string; ratiosFetchedAt?: string | null;
                    }>;
                    Object.entries(batch).forEach(([symbol, data]) => {
                        requested.current.add(symbol);
                        setEntry(symbol, {
                            status: 'done', data,
                            ratiosPending: data.ratiosPending,
                            fetchedAt: data.fetchedAt,
                            ratiosFetchedAt: data.ratiosFetchedAt,
                        });
                    });
                } catch {
                    // Network error — unblock so fallback can retry.
                    chunk.forEach(s => cacheChecked.current.delete(s));
                }
            }));
        })();
    }, [setEntry]);

    return { map, refresh, loadMany, loadCached, progress };
}
