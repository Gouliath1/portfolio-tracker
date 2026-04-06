'use client';

import { useState, useEffect } from 'react';
import { Position } from '@portfolio/types';
import { calculateHistoricalPortfolioValues } from '@portfolio/core';

export interface DailyPnl {
    absoluteChange: number;   // in base currency (uses same field names as HistoricalSnapshot)
    percentageChange: number;
}

export function useDailyPnl(positions: Position[], currentValue: number): DailyPnl | null {
    const [dailyPnl, setDailyPnl] = useState<DailyPnl | null>(null);

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

                const snapshots = await calculateHistoricalPortfolioValues(
                    positions,
                    [yesterday, today],
                    false // don't need position details
                );

                if (cancelled) return;

                // Find yesterday's value — the snapshot closest to yesterday
                const ySnap = snapshots.find(s => {
                    const d = new Date(s.date);
                    return d.toDateString() === yesterday.toDateString();
                }) ?? snapshots[0];

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
    }, [positions, currentValue]);

    return dailyPnl;
}
