import { useState, useEffect, useCallback } from 'react';
import { Position } from '@portfolio/types';
import { calculateHistoricalPortfolioValues, createLiveSnapshot, HistoricalSnapshot } from '@portfolio/core';
import { TimelineFilter, generateDateIntervals } from './chartUtils';
import { readCachedChart, writeCachedChart } from '../../../utils/pnlCache';

// `currency` must be the same base currency the `positions` were computed in
// (passed down from the page). Reading currency from a separate useBaseCurrency()
// instance here would desync it from the positions: the value series recomputes
// from raw prices into this currency while the cost series is read straight off
// position.costInJPY (already in the page's currency) — leaving the cost basis
// line stuck in the previously-selected currency after a switch.
export const useChartData = (positions: Position[], selectedTimeline: TimelineFilter, currency: string) => {
    const [historicalData, setHistoricalData] = useState<HistoricalSnapshot[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // The last interval is "now", but historical series only have the last
    // close (monthly/daily depending on timeline). Anchor the final point to
    // the live position values so the chart endpoint matches the KPI cards.
    const anchorToLive = useCallback((snapshots: HistoricalSnapshot[]): HistoricalSnapshot[] => {
        if (snapshots.length === 0) return snapshots;
        const last = snapshots[snapshots.length - 1];
        return [...snapshots.slice(0, -1), createLiveSnapshot(positions, last.date)];
    }, [positions]);

    const calculateHistoricalData = useCallback(async () => {
        if (positions.length === 0) {
            setHistoricalData([]);
            return;
        }

        const isDev = process.env.NODE_ENV !== 'production';

        // Same tiered caching as PnL summary: same-day cache short-circuits the
        // recompute; older cache paints, then recomputes in the background.
        let cacheFromToday = false;
        const cached = readCachedChart(positions, currency, selectedTimeline);
        if (cached) {
            setHistoricalData(anchorToLive(cached.snapshots));
            cacheFromToday = cached.fromToday;
            if (isDev) console.log(`[chart-cache] HIT — fromToday=${cached.fromToday}, timeline=${selectedTimeline}, snapshots=${cached.snapshots.length}`);
        } else if (isDev) {
            console.log(`[chart-cache] MISS — timeline=${selectedTimeline}`);
        }

        if (cacheFromToday) return; // skip recompute entirely

        setIsLoading(true);
        setError(null);

        try {
            const dateIntervals = generateDateIntervals(selectedTimeline, positions);
            const snapshots = await calculateHistoricalPortfolioValues(positions, dateIntervals, true, currency);
            setHistoricalData(anchorToLive(snapshots));
            // Cache the raw historical series; the live anchor is re-applied on
            // every read so a later visit overlays that day's fresh prices.
            writeCachedChart(positions, currency, selectedTimeline, snapshots);
        } catch (err) {
            console.error('Error calculating historical data:', err);
            setError('Failed to calculate historical portfolio data');
            if (!cached) setHistoricalData([]); // keep stale cache if recompute fails
        } finally {
            setIsLoading(false);
        }
    }, [positions, selectedTimeline, currency, anchorToLive]);

    useEffect(() => {
        calculateHistoricalData();
    }, [calculateHistoricalData]);

    return {
        historicalData,
        isLoading,
        error
    };
};
