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
    /** Stops an in-flight loadMany; symbols not yet fetched revert to their previous entry. */
    cancelLoad: () => void;
    loadCached: (symbols: string[]) => void;
    /** Silently re-fetch symbols that have existing data but are missing sector.
     *  Does NOT set loading state so the existing price/ratio data stays visible. */
    backfillSector: (symbols: string[]) => void;
    progress: LoadProgress | null;
    /** Outcome of the last completed bulk run: rows refetched vs already current (shared cache). */
    lastRun: { refreshed: number; cached: number } | null;
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
// Rows stream back one by one, so chunks can be large: a full refresh is ~36
// requests instead of one per symbol. The server caps a request at 50.
const REFRESH_CHUNK = 50;
const REFRESH_CONCURRENCY = 2;
const BULK_GAP_MS = 250;
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

/** Reset all module-level state. Only for use in tests. */
export function __resetForTests__(): void {
    _store.map.clear();
    _store.requested.clear();
    _store.cacheChecked.clear();
    _lsInitDone = false;
    if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
}

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

    // Running totals for the current bulk run, published when it finishes.
    const runTally = useRef({ refreshed: 0, cached: 0 });
    const [lastRun, setLastRun] = useState<{ refreshed: number; cached: number } | null>(null);

    /** Refresh one chunk through the batch endpoint and write every row into the store. */
    const refreshChunk = useCallback(async (chunk: string[], onRow: () => void, shouldStop: () => boolean) => {
        type Row = StockFundamentals & {
            ratiosPending?: boolean; ratiosError?: string;
            fetchedAt?: string; ratiosFetchedAt?: string | null;
        };
        const seen = new Set<string>();
        const apply = (symbol: string, data: Row) => {
            seen.add(symbol);
            setEntry(symbol, {
                status: 'done', data,
                ratiosPending: data.ratiosPending,
                ratiosError: data.ratiosError,
                fetchedAt: data.fetchedAt,
                ratiosFetchedAt: data.ratiosFetchedAt,
            });
            onRow();
        };
        const failRest = (reason: string) => chunk.filter(s => !seen.has(s)).forEach(s => {
            requested.current.delete(s);
            setEntry(s, { status: 'error', reason });
            onRow();
        });
        try {
            const res = await fetch('/api/screener/refresh', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ symbols: chunk, stream: true }),
            });
            if (!res.ok) return failRest(`HTTP ${res.status}`);

            const reader = res.body?.getReader?.();
            if (reader) {
                // NDJSON: one row per line as soon as the server has it, so the table
                // fills in steadily instead of waiting for the whole chunk.
                const decoder = new TextDecoder();
                let buffer = '';
                const handle = (line: string) => {
                    if (!line.trim()) return;
                    const msg = JSON.parse(line) as { symbol?: string; data?: Row; done?: boolean; refreshed?: number; cached?: number };
                    if (msg.done) {
                        runTally.current.refreshed += msg.refreshed ?? 0;
                        runTally.current.cached += msg.cached ?? 0;
                    } else if (msg.symbol && msg.data) {
                        apply(msg.symbol, msg.data);
                    }
                };
                for (;;) {
                    if (shouldStop()) { void reader.cancel(); return; }
                    const { value, done } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() ?? '';
                    lines.forEach(handle);
                }
                handle(buffer);
            } else {
                // No streaming body (older clients/mocks): the endpoint also answers with plain JSON.
                const { results, refreshed = 0, cached = 0 } = await res.json() as {
                    refreshed?: number; cached?: number; results: Record<string, Row>;
                };
                runTally.current.refreshed += refreshed;
                runTally.current.cached += cached;
                for (const symbol of chunk) if (results[symbol]) apply(symbol, results[symbol]);
            }
            failRest('no data');
        } catch (e) {
            failRest(e instanceof Error ? e.message : 'network error');
        }
    }, [setEntry]);

    // Bumped by every loadMany/cancelLoad so a superseded run's workers stop picking up symbols.
    const runId = useRef(0);
    const pendingRestore = useRef<Map<string, FundEntry | undefined>>(new Map());

    const restorePending = useCallback(() => {
        const pending = pendingRestore.current;
        if (pending.size === 0) return;
        pendingRestore.current = new Map();
        _setMap(prev => {
            const next = new Map(prev);
            pending.forEach((entry, s) => {
                if (entry) { next.set(s, entry); _store.map.set(s, entry); }
                else { next.delete(s); _store.map.delete(s); requested.current.delete(s); }
            });
            return next;
        });
    }, []);

    const loadMany = useCallback((symbols: string[]) => {
        if (symbols.length === 0) return;
        restorePending();
        const myRun = ++runId.current;
        symbols.forEach(s => requested.current.add(s));

        const restore = new Map<string, FundEntry | undefined>();
        symbols.forEach(s => restore.set(s, _store.map.get(s)));
        pendingRestore.current = restore;

        _setMap(prev => {
            const next = new Map(prev);
            symbols.forEach(s => {
                const loading: FundEntry = { status: 'loading' };
                next.set(s, loading);
                _store.map.set(s, loading);
            });
            return next;
        });

        runTally.current = { refreshed: 0, cached: 0 };
        const total = symbols.length;
        let done = 0;
        setProgress({ done, total });

        // One request per chunk instead of one per symbol. The server answers from
        // the shared cache for anything already refreshed today (by anyone), so
        // "refresh all" only costs upstream calls for what is genuinely stale.
        const chunks: string[][] = [];
        for (let i = 0; i < symbols.length; i += REFRESH_CHUNK) chunks.push(symbols.slice(i, i + REFRESH_CHUNK));

        let idx = 0;
        const worker = async () => {
            while (idx < chunks.length && runId.current === myRun) {
                const chunk = chunks[idx++];
                chunk.forEach(s => restore.delete(s));
                await refreshChunk(chunk, () => {
                    // Per row, so the counter moves steadily while a chunk streams in.
                    if (runId.current !== myRun) return;
                    done += 1;
                    setProgress({ done, total });
                }, () => runId.current !== myRun);
                if (runId.current !== myRun) return;
                await delay(BULK_GAP_MS);
            }
        };
        void Promise.all(Array.from({ length: Math.min(REFRESH_CONCURRENCY, chunks.length) }, worker))
            .finally(() => {
                if (runId.current !== myRun) return;
                setProgress(null);
                setLastRun({ ...runTally.current });
            });
    }, [refreshChunk, restorePending]);

    const cancelLoad = useCallback(() => {
        runId.current += 1;
        restorePending();
        setProgress(null);
    }, [restorePending]);

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

    const backfillSector = useCallback((symbols: string[]) => {
        if (symbols.length === 0) return;
        // Fetch without touching the existing map entry so the UI keeps showing
        // current price/ratio data while sector is resolved in the background.
        symbols.forEach(s => {
            requested.current.add(s);
            void fetchOne(s); // no opts.fresh — server will use cached price/ratios, only fetch sector
        });
    }, [fetchOne]);

    return { map, refresh, loadMany, cancelLoad, loadCached, backfillSector, progress, lastRun };
}
