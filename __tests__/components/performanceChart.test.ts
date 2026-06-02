/**
 * Tests for the chart data builder.
 *
 * These verify the *data* layer feeding Chart.js — independent of any
 * dual-axis rendering. If "P&L line sits above Value line" reflects a real
 * data bug, these invariants would fail.
 */

import { createChartData } from '../../src/components/charts/performanceChart/chartData';
import type { HistoricalSnapshot } from '../../src/lib/core';
import type { Position } from '../../src/types';

const mkSnapshot = (
    date: Date,
    value: number,
    cost: number,
    positionsCount = 1,
): HistoricalSnapshot => ({
    date,
    totalValueJPY: value,
    totalCostJPY: cost,
    pnlJPY: value - cost,
    pnlPercentage: cost > 0 ? ((value - cost) / cost) * 100 : 0,
    positionsCount,
    cumulativePnlJPY: value - cost,
    cumulativePnlPercentage: cost > 0 ? ((value - cost) / cost) * 100 : 0,
});

const positions: Position[] = []; // chart data builder only reads transaction dates for markers

describe('createChartData — value/cost/pnl invariants', () => {
    it('emits identical-length arrays for value, cost, and pnl', () => {
        const dates = [
            new Date('2020-01-01'),
            new Date('2021-01-01'),
            new Date('2022-01-01'),
        ];
        const snapshots = [
            mkSnapshot(dates[0], 100, 80),
            mkSnapshot(dates[1], 150, 100),
            mkSnapshot(dates[2], 90, 100),
        ];

        const data = createChartData(dates, snapshots, positions, '5Y', true);

        expect(data.datasets).toHaveLength(3);
        const [value, cost, pnl] = data.datasets;
        expect(value.data).toHaveLength(3);
        expect(cost.data).toHaveLength(3);
        expect(pnl.data).toHaveLength(3);
    });

    it('keeps pnl[i] === value[i] - cost[i] at every index (showValues=true)', () => {
        const dates = [
            new Date('2020-01-01'),
            new Date('2021-01-01'),
            new Date('2022-01-01'),
        ];
        const snapshots = [
            mkSnapshot(dates[0], 100, 80),
            mkSnapshot(dates[1], 150, 100),
            mkSnapshot(dates[2], 90, 100),
        ];

        const data = createChartData(dates, snapshots, positions, '5Y', true);
        const [value, cost, pnl] = data.datasets;

        for (let i = 0; i < dates.length; i++) {
            expect(pnl.data[i]).toBeCloseTo(
                (value.data[i] as number) - (cost.data[i] as number),
                6,
            );
        }
    });

    it('emits zeros for value/cost/pnl at indices with no snapshot (no positions yet)', () => {
        const dates = [new Date('2005-01-01'), new Date('2020-01-01')];
        const snapshots: HistoricalSnapshot[] = [
            // index 0 deliberately undefined — represents a date before any positions
            // index 1 has a real snapshot
            undefined as unknown as HistoricalSnapshot,
            mkSnapshot(dates[1], 100, 80),
        ];

        const data = createChartData(dates, snapshots, positions, 'All', true);
        const [value, cost, pnl] = data.datasets;

        expect(value.data[0]).toBe(0);
        expect(cost.data[0]).toBe(0);
        expect(pnl.data[0]).toBe(0);
        // Sanity: pre-position era shows zero P&L, NOT a positive number.
        expect(pnl.data[0]).not.toBeGreaterThan(0);
    });

    it('emits zeros for value/cost/pnl when snapshot itself reports an empty portfolio', () => {
        const dates = [new Date('2005-01-01'), new Date('2020-01-01')];
        const snapshots: HistoricalSnapshot[] = [
            mkSnapshot(dates[0], 0, 0, 0), // explicit "no positions at this date"
            mkSnapshot(dates[1], 100, 80),
        ];

        const data = createChartData(dates, snapshots, positions, 'All', true);
        const [value, cost, pnl] = data.datasets;

        expect(value.data[0]).toBe(0);
        expect(cost.data[0]).toBe(0);
        expect(pnl.data[0]).toBe(0);
    });

    // The chart redesign collapsed the old dual-axis layout to a single 'y'
    // axis shared by value/cost/pnl, so P&L stays on 'y' regardless of mode.
    it('keeps P&L on the single y axis in both value and percent modes', () => {
        const dates = [new Date('2020-01-01')];
        const snapshots = [mkSnapshot(dates[0], 100, 80)];

        const values = createChartData(dates, snapshots, positions, '5Y', true);
        const percent = createChartData(dates, snapshots, positions, '5Y', false);

        expect(values.datasets[2].yAxisID).toBe('y');
        expect(percent.datasets[2].yAxisID).toBe('y');
    });
});
