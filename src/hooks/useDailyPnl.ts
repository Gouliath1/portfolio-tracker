'use client';

import { useState, useEffect } from 'react';
import { Position } from '@portfolio/types';
import { calculateHistoricalPortfolioValues } from '@portfolio/core';
import { useBaseCurrency } from './useBaseCurrency';

export interface DailyPnl {
    absoluteChange: number;   // in base currency (uses same field names as HistoricalSnapshot)
    percentageChange: number;
}

export function useDailyPnl(positions: Position[], currentValue: number): DailyPnl | null {
    const [dailyPnl, setDailyPnl] = useState<DailyPnl | null>(null);
    const { baseCurrency } = useBaseCurrency();

    useEffect(() => {
        if (positions.length === 0 || currentValue === 0) return;

        let cancelled = false;

        async function compute() {
            try {
                // We only need the last two business days
                const today = new Date();
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);
                // Step back further over weekends
                while (yesterday.getDay() === 0 || yesterday.getDay() === 6) {
                    yesterday.setDate(yesterday.getDate() - 1);
                }

                // Use daily resolution so yesterday's price is accurate (not a monthly candle)
                const snapshots = await calculateHistoricalPortfolioValues(
                    positions,
                    [yesterday],
                    false,
                    baseCurrency,
                    '1d'
                );

                if (cancelled) return;

                const ySnap = snapshots[0];

                if (!ySnap || ySnap.totalValueJPY === 0) return;

                const absoluteChange = currentValue - ySnap.totalValueJPY;
                const percentageChange = (absoluteChange / ySnap.totalValueJPY) * 100;

                setDailyPnl({ absoluteChange, percentageChange });
            } catch {
                // Non-critical — daily P&L is best-effort
            }
        }

        compute();
        return () => { cancelled = true; };
    }, [positions, currentValue, baseCurrency]);

    return dailyPnl;
}
