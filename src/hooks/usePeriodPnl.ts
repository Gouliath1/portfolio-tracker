'use client';

import { useState, useEffect } from 'react';
import { Position } from '@portfolio/types';
import { calculateHistoricalPortfolioValues } from '@portfolio/core';
import { readCachedPeriodValue, writeCachedPeriodValue, clearLegacyDailyCache, type PnlPeriod } from '../utils/pnlCache';

export type { PnlPeriod };

export const PNL_PERIODS: PnlPeriod[] = ['1w', '1m'];

export interface PeriodPnl {
    absoluteChange: number;   // in base currency
    percentageChange: number;
}

export type PeriodPnlMap = Record<PnlPeriod, PeriodPnl | null>;

const EMPTY: PeriodPnlMap = { '1w': null, '1m': null };

// Reference date for a lookback window: N calendar days/months back, then
// rolled back off the weekend so we land on a trading day.
function referenceDate(period: PnlPeriod): Date {
    const d = new Date();
    if (period === '1w') d.setDate(d.getDate() - 7);
    else d.setMonth(d.getMonth() - 1);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
    return d;
}

const normalizeDate = (s: string) => s.replace(/\//g, '-');

// Capital deployed *inside* the window. Lots bought after the reference date
// are counted in `currentValue` but not in the historical snapshot, so without
// this the delta would book fresh contributions as gains. Over a day that is
// noise; over a month it is the difference between a performance number and a
// meaningless one. Sales need no symmetric term: `positions` holds open lots
// only, so a lot sold during the window is absent from both sides.
function contributionsSince(positions: Position[], since: Date): number {
    const cutoff = normalizeDate(since.toISOString().split('T')[0]);
    return positions
        .filter(p => normalizeDate(p.transactionDate) > cutoff)
        .reduce((sum, p) => sum + p.costInJPY, 0);
}

function computeDelta(currentValue: number, pastValue: number, contributions: number): PeriodPnl | null {
    if (pastValue === 0) return null;
    const absoluteChange = currentValue - pastValue - contributions;
    return { absoluteChange, percentageChange: (absoluteChange / pastValue) * 100 };
}

// `currency` must match the base currency `currentValue` and `positions` were
// computed in (passed down from the page). Reading it from a separate
// useBaseCurrency() instance here would desync it: the past value would be
// computed in a stale currency and subtracted from a current value in the new
// one, producing a nonsense delta after a currency switch.
export function usePeriodPnl(positions: Position[], currentValue: number, currency: string): PeriodPnlMap {
    const [pnl, setPnl] = useState<PeriodPnlMap>(EMPTY);

    useEffect(() => { clearLegacyDailyCache(); }, []);

    useEffect(() => {
        if (positions.length === 0 || currentValue === 0) return;

        let cancelled = false;
        const isDev = process.env.NODE_ENV !== 'production';

        // Same tiered caching as PnL/chart: a same-day cache entry short-circuits
        // the recompute, because a past trading day's close doesn't move intraday.
        const seeded: Partial<PeriodPnlMap> = {};
        const stale: PnlPeriod[] = [];
        for (const period of PNL_PERIODS) {
            const cached = readCachedPeriodValue(positions, currency, period);
            if (cached) {
                const delta = computeDelta(currentValue, cached.pastValue, contributionsSince(positions, referenceDate(period)));
                if (delta) seeded[period] = delta;
            }
            if (!cached?.fromToday) stale.push(period);
            if (isDev) console.log(`[period-cache] ${period} ${cached ? `HIT — fromToday=${cached.fromToday}, past=${cached.pastValue}` : 'MISS'}`);
        }
        if (Object.keys(seeded).length > 0) setPnl(prev => ({ ...prev, ...seeded }));

        async function compute(periods: PnlPeriod[]) {
            try {
                const dates = periods.map(referenceDate);
                // One call for both windows so the (expensive) price/FX prefetch
                // is shared; results come back in the order the dates went in.
                const snapshots = await calculateHistoricalPortfolioValues(positions, dates, false, currency, '1d');
                if (cancelled) return;

                const updates: Partial<PeriodPnlMap> = {};
                periods.forEach((period, i) => {
                    const snap = snapshots[i];
                    if (!snap || snap.totalValueJPY === 0) return;
                    writeCachedPeriodValue(positions, currency, period, snap.totalValueJPY);
                    const delta = computeDelta(currentValue, snap.totalValueJPY, contributionsSince(positions, dates[i]));
                    if (delta) updates[period] = delta;
                });
                if (Object.keys(updates).length > 0) setPnl(prev => ({ ...prev, ...updates }));
            } catch {
                // Non-critical — period P&L is best-effort.
            }
        }

        if (stale.length > 0) compute(stale);
        return () => { cancelled = true; };
    }, [positions, currentValue, currency]);

    return pnl;
}
