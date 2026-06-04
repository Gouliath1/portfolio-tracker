'use client';

import { useEffect, useState } from 'react';

/**
 * Fetches the { ticker: assetClass } map for a set of tickers.
 *
 * Asset class is effectively static per ticker, so we cache it client-side in
 * localStorage (mirroring pnlCache): cached classes paint immediately on load
 * and only genuinely-new tickers hit /api/asset-classes. This matters because
 * the server-side cache (Turso) may be unavailable, in which case every request
 * re-derives from Yahoo — without this cache the allocation pie would wait on a
 * fresh network round-trip on every reload, lagging behind the rest of the UI.
 *
 * 'Other' is cached only briefly: it's also the fallback when Yahoo can't
 * classify a ticker, so a short TTL lets a transient miss self-heal instead of
 * sticking a wrong segment on the pie for weeks.
 */
const STORAGE_KEY = 'pt_assetclass_v1';
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30; // 30 days for a resolved class
const OTHER_MAX_AGE_MS = 1000 * 60 * 60 * 24; // 1 day for the 'Other' fallback

type Entry = { cls: string; at: number };
type Store = Record<string, Entry>;

function readStore(): Store {
    if (typeof window === 'undefined') return {};
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Store;
    } catch {
        return {};
    }
}

function writeStore(store: Store): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
        /* quota / private mode — caching is best-effort */
    }
}

function isFresh(entry: Entry, now: number): boolean {
    const maxAge = entry.cls === 'Other' ? OTHER_MAX_AGE_MS : MAX_AGE_MS;
    return now - entry.at < maxAge;
}

export function useAssetClasses(tickers: (string | number)[]): {
    assetClasses: Record<string, string>;
    isLoading: boolean;
} {
    const key = [...new Set(tickers.map(String))].sort().join(',');
    const [assetClasses, setAssetClasses] = useState<Record<string, string>>({});
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!key) {
            setAssetClasses({});
            return;
        }

        const requested = key.split(',');
        const now = Date.now();
        const store = readStore();

        // Paint whatever we have cached immediately.
        const fromCache: Record<string, string> = {};
        const missing: string[] = [];
        for (const t of requested) {
            const entry = store[t];
            if (entry && isFresh(entry, now)) fromCache[t] = entry.cls;
            else missing.push(t);
        }
        setAssetClasses(fromCache);

        // Everything cached → no network, instant render.
        if (missing.length === 0) {
            setIsLoading(false);
            return;
        }

        let cancelled = false;
        setIsLoading(true);
        fetch(`/api/asset-classes?tickers=${encodeURIComponent(missing.join(','))}`)
            .then(res => (res.ok ? res.json() : { assetClasses: {} }))
            .then(data => {
                if (cancelled) return;
                const fetched: Record<string, string> = data.assetClasses ?? {};
                if (Object.keys(fetched).length > 0) {
                    const next = readStore();
                    const at = Date.now();
                    for (const [t, cls] of Object.entries(fetched)) {
                        next[t] = { cls: String(cls), at };
                    }
                    writeStore(next);
                    setAssetClasses(prev => ({ ...prev, ...fetched }));
                }
            })
            .catch(() => {
                /* keep cached values on failure */
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [key]);

    return { assetClasses, isLoading };
}
