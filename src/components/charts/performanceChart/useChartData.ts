import { useState, useEffect, useCallback } from 'react';
import { Position } from '@portfolio/types';
import { calculateHistoricalPortfolioValues, HistoricalSnapshot } from '@portfolio/core';
import { TimelineFilter, generateDateIntervals } from './chartUtils';
import { useBaseCurrency } from '../../../hooks/useBaseCurrency';
import { readCachedChart, writeCachedChart } from '../../../utils/pnlCache';

export const useChartData = (positions: Position[], selectedTimeline: TimelineFilter) => {
    const [historicalData, setHistoricalData] = useState<HistoricalSnapshot[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { currency } = useBaseCurrency();

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
            setHistoricalData(cached.snapshots);
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
            setHistoricalData(snapshots);
            writeCachedChart(positions, currency, selectedTimeline, snapshots);
        } catch (err) {
            console.error('Error calculating historical data:', err);
            setError('Failed to calculate historical portfolio data');
            if (!cached) setHistoricalData([]); // keep stale cache if recompute fails
        } finally {
            setIsLoading(false);
        }
    }, [positions, selectedTimeline, currency]);

    useEffect(() => {
        calculateHistoricalData();
    }, [calculateHistoricalData]);

    return {
        historicalData,
        isLoading,
        error
    };
};
