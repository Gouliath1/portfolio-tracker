'use client';

import { useCallback, useEffect, useState } from 'react';
import { calculatePortfolioSummary } from '@portfolio/core';
import { PortfolioSummary as PortfolioSummaryType } from '@portfolio/types';
import { loadPositions } from '../utils/positions';
import { readCachedSummary, writeCachedSummary } from '../utils/pnlCache';
import type { TranslationKey } from '../i18n';

/**
 * Surfaced as a translation key, not a message: the consuming component owns
 * the active language and re-renders the error correctly if it changes.
 * `detail` carries the raw Error text, which comes from outside the app.
 */
export interface SummaryLoadError {
    key: TranslationKey;
    detail?: string;
}

// Read-only data loader for views that just need the latest portfolio summary
// (e.g. the deep-dive route). Mirrors the dashboard's tiered-cache strategy:
// same-day cache short-circuits; older cache paints, then recomputes in the
// background; no cache hits the full compute path.
//
// Pass currencyHydrated=false while the base currency is still being read
// from localStorage; the hook waits before loading to avoid computing with
// the SSR fallback currency and writing the wrong cache slot. Bump `refreshKey`
// to reload, e.g. when a long-lived panel is reopened after positions changed.
export function usePortfolioSummaryData(currency: string, currencyHydrated: boolean = true, refreshKey: number = 0) {
    const [summary, setSummary] = useState<PortfolioSummaryType | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<SummaryLoadError | null>(null);

    useEffect(() => {
        if (!currencyHydrated) return;
        let cancelled = false;
        const run = async () => {
            try {
                const positions = await loadPositions();

                let cacheFromToday = false;
                const cached = readCachedSummary(positions, currency);
                if (cached) {
                    if (cancelled) return;
                    setSummary(cached.summary);
                    setError(null);
                    setLoading(false);
                    cacheFromToday = cached.fromToday;
                }

                if (cacheFromToday) return;

                const fresh = await calculatePortfolioSummary(positions, false, currency);
                if (cancelled) return;
                setSummary(fresh);
                writeCachedSummary(positions, currency, fresh);
                setError(null);
                setLoading(false);
            } catch (err) {
                if (cancelled) return;
                setError({
                    key: 'home.errLoadPortfolio',
                    detail: err instanceof Error ? err.message : undefined,
                });
                setLoading(false);
            }
        };

        run();
        return () => { cancelled = true; };
    }, [currency, currencyHydrated, refreshKey]);

    /**
     * Recompute with fresh prices, bypassing the day's cache. Rejects on failure
     * so a caller that asked for it (a button, a confirmed AI action) can say so.
     */
    const refresh = useCallback(async () => {
        const positions = await loadPositions();
        const fresh = await calculatePortfolioSummary(positions, true, currency);
        setSummary(fresh);
        writeCachedSummary(positions, currency, fresh);
        setError(null);
    }, [currency]);

    return { summary, loading, error, refresh };
}
