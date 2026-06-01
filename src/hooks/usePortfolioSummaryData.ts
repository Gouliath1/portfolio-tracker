'use client';

import { useEffect, useState } from 'react';
import { calculatePortfolioSummary } from '@portfolio/core';
import { PortfolioSummary as PortfolioSummaryType } from '@portfolio/types';
import { loadPositions } from '../utils/positions';
import { readCachedSummary, writeCachedSummary } from '../utils/pnlCache';

// Read-only data loader for views that just need the latest portfolio summary
// (e.g. the deep-dive route). Mirrors the dashboard's tiered-cache strategy:
// same-day cache short-circuits; older cache paints, then recomputes in the
// background; no cache hits the full compute path.
//
// Pass currencyHydrated=false while the base currency is still being read
// from localStorage; the hook waits before loading to avoid computing with
// the SSR fallback currency and writing the wrong cache slot.
export function usePortfolioSummaryData(currency: string, currencyHydrated: boolean = true) {
    const [summary, setSummary] = useState<PortfolioSummaryType | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

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
                setError(err instanceof Error ? err.message : 'Failed to load portfolio data');
                setLoading(false);
            }
        };

        run();
        return () => { cancelled = true; };
    }, [currency, currencyHydrated]);

    return { summary, loading, error };
}
