'use client';

import { useState, useEffect } from 'react';
import { Position } from '@portfolio/types';
import { calculateHistoricalPortfolioValues } from '@portfolio/core';
import { readCachedDailyValue, writeCachedDailyValue } from '../utils/pnlCache';

export interface DailyPnl {
    absoluteChange: number;   // in base currency (uses same field names as HistoricalSnapshot)
    percentageChange: number;
}

function computeDelta(currentValue: number, yesterdayValue: number): DailyPnl | null {
    if (yesterdayValue === 0) return null;
    const absoluteChange = currentValue - yesterdayValue;
    const percentageChange = (absoluteChange / yesterdayValue) * 100;
    return { absoluteChange, percentageChange };
}

// `currency` must match the base currency `currentValue` and `positions` were
// computed in (passed down from the page). Reading it from a separate
// useBaseCurrency() instance here would desync it: yesterday's value would be
// computed in a stale currency and subtracted from a current value in the new
// one, producing a nonsense daily delta after a currency switch.
export function useDailyPnl(positions: Position[], currentValue: number, currency: string): DailyPnl | null {
    const [dailyPnl, setDailyPnl] = useState<DailyPnl | null>(null);

    useEffect(() => {
        if (positions.length === 0 || currentValue === 0) return;

        let cancelled = false;
        const isDev = process.env.NODE_ENV !== 'production';

        // Same tiered caching as PnL/chart: same-day cache short-circuits the
        // recompute. Yesterday's close doesn't change intraday.
        let servedFromCache = false;
        const cached = readCachedDailyValue(positions, currency);
        if (cached) {
            const delta = computeDelta(currentValue, cached.yesterdayValue);
            if (delta) setDailyPnl(delta);
            servedFromCache = true;
            if (isDev) console.log(`[daily-cache] HIT — fromToday=${cached.fromToday}, yesterday=${cached.yesterdayValue}`);
            if (cached.fromToday) return; // skip recompute entirely
        } else if (isDev) {
            console.log('[daily-cache] MISS');
        }

        async function compute() {
            try {
                const today = new Date();
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);
                while (yesterday.getDay() === 0 || yesterday.getDay() === 6) {
                    yesterday.setDate(yesterday.getDate() - 1);
                }

                const snapshots = await calculateHistoricalPortfolioValues(
                    positions,
                    [yesterday],
                    false,
                    currency,
                    '1d'
                );

                if (cancelled) return;

                const ySnap = snapshots[0];
                if (!ySnap || ySnap.totalValueJPY === 0) return;

                writeCachedDailyValue(positions, currency, ySnap.totalValueJPY);
                const delta = computeDelta(currentValue, ySnap.totalValueJPY);
                if (delta) setDailyPnl(delta);
            } catch {
                // Non-critical — daily P&L is best-effort
            }
        }

        // If we served from cache but it's not from today, still recompute in
        // the background to refresh.
        if (!servedFromCache || !cached?.fromToday) {
            compute();
        }
        return () => { cancelled = true; };
    }, [positions, currentValue, currency]);

    return dailyPnl;
}
