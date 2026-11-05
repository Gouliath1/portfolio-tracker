import { useState, useEffect, useCallback, useMemo } from 'react';
import { Position } from '@portfolio/types';
import { calculateHistoricalPortfolioValues, createLiveSnapshot, windowDates, HistoricalSnapshot } from '@portfolio/core';
import { TimelineSelection, resolveWindow, selectionKey } from './chartUtils';
import { readCachedChart, writeCachedChart } from '../../../utils/pnlCache';
import type { TranslationKey } from '../../../i18n';

/**
 * The hook surfaces a translation key rather than a message: the component that
 * renders it owns the active language, and a key keeps the error correct if the
 * user switches language while it is on screen.
 */
export const HISTORICAL_DATA_ERROR_KEY: TranslationKey = 'chart.errHistoricalData';

// `currency` must be the same base currency the `positions` were computed in
// (passed down from the page). Reading currency from a separate useBaseCurrency()
// instance here would desync it from the positions: the value series recomputes
// from raw prices into this currency while the cost series is read straight off
// position.costInJPY (already in the page's currency) — leaving the cost basis
// line stuck in the previously-selected currency after a switch.
export const useChartData = (positions: Position[], selection: TimelineSelection, currency: string) => {
    // Resolved once per selection (not per render) so the dates the chart labels
    // and the snapshots computed for them can't drift apart as the clock moves.
    const key = selectionKey(selection);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the selection's identity
    const dateWindow = useMemo(() => resolveWindow(selection, positions), [key, positions]);
    const dateIntervals = useMemo(() => (dateWindow ? windowDates(dateWindow) : []), [dateWindow]);

    const [historicalData, setHistoricalData] = useState<HistoricalSnapshot[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<TranslationKey | null>(null);

    // The last interval is "now", but historical series only have the last
    // close (monthly/daily depending on timeline). Anchor the final point to
    // the live position values so the chart endpoint matches the KPI cards.
    const anchorToLive = useCallback((snapshots: HistoricalSnapshot[]): HistoricalSnapshot[] => {
        if (snapshots.length === 0) return snapshots;
        const last = snapshots[snapshots.length - 1];
        return [...snapshots.slice(0, -1), createLiveSnapshot(positions, last.date)];
    }, [positions]);

    const calculateHistoricalData = useCallback(async () => {
        if (positions.length === 0 || !dateWindow) {
            setHistoricalData([]);
            return;
        }

        const isDev = process.env.NODE_ENV !== 'production';

        // Same tiered caching as PnL summary: same-day cache short-circuits the
        // recompute; older cache paints, then recomputes in the background.
        let cacheFromToday = false;
        const cached = readCachedChart(positions, currency, key);
        if (cached) {
            setHistoricalData(anchorToLive(cached.snapshots));
            cacheFromToday = cached.fromToday;
            if (isDev) console.log(`[chart-cache] HIT — fromToday=${cached.fromToday}, timeline=${key}, snapshots=${cached.snapshots.length}`);
        } else if (isDev) {
            console.log(`[chart-cache] MISS — timeline=${key}`);
        }

        if (cacheFromToday) return; // skip recompute entirely

        setIsLoading(true);
        setError(null);

        try {
            const snapshots = await calculateHistoricalPortfolioValues(positions, dateIntervals, true, currency);
            setHistoricalData(anchorToLive(snapshots));
            // Cache the raw historical series; the live anchor is re-applied on
            // every read so a later visit overlays that day's fresh prices.
            writeCachedChart(positions, currency, key, snapshots);
        } catch (err) {
            console.error('Error calculating historical data:', err);
            setError(HISTORICAL_DATA_ERROR_KEY);
            if (!cached) setHistoricalData([]); // keep stale cache if recompute fails
        } finally {
            setIsLoading(false);
        }
    }, [positions, dateWindow, dateIntervals, key, currency, anchorToLive]);

    useEffect(() => {
        calculateHistoricalData();
    }, [calculateHistoricalData]);

    return {
        dateWindow,
        dateIntervals,
        historicalData,
        isLoading,
        error
    };
};
