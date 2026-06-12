/**
 * @jest-environment node
 *
 * Guards the rule that the chart's final point is anchored to the live
 * position values (sum of currentValueJPY / costInJPY — the same numbers the
 * KPI cards display) rather than the last historical close, so the endpoint
 * badges always match the headline Total Value / P&L.
 */

import { createLiveSnapshot } from '@portfolio/core/historicalPortfolioCalculations';
import { Position } from '@portfolio/types';

function makePosition(overrides: Partial<Position>): Position {
    return {
        transactionDate: '2020-01-15',
        ticker: 'AAPL',
        fullName: 'Apple Inc.',
        account: 'main',
        quantity: 10,
        costPerUnit: 100,
        transactionCcy: 'USD',
        stockCcy: 'USD',
        way: 'buy',
        status: 'open',
        currentPrice: 200,
        costInJPY: 150_000,
        currentValueJPY: 300_000,
        pnlJPY: 150_000,
        pnlPercentage: 100,
        transactionFxRate: 150,
        currentFxRate: 150,
        dividendIncomeJPY: 0,
        totalReturnPercentage: 100,
        ...overrides,
    } as Position;
}

describe('createLiveSnapshot — chart endpoint matches KPI totals', () => {
    it('sums live currentValueJPY/costInJPY exactly like the KPI cards', () => {
        const positions = [
            makePosition({ ticker: 'AAPL', costInJPY: 150_000, currentValueJPY: 300_000 }),
            makePosition({ ticker: 'MSFT', fullName: 'Microsoft', costInJPY: 200_000, currentValueJPY: 250_000 }),
        ];

        const date = new Date('2026-06-12');
        const snapshot = createLiveSnapshot(positions, date);

        expect(snapshot.date).toBe(date);
        expect(snapshot.totalValueJPY).toBe(550_000);
        expect(snapshot.totalCostJPY).toBe(350_000);
        expect(snapshot.pnlJPY).toBe(200_000);
        expect(snapshot.pnlPercentage).toBeCloseTo((200_000 / 350_000) * 100);
        expect(snapshot.positionsCount).toBe(2);
    });

    it('groups lots by (ticker, account) like the historical series', () => {
        const positions = [
            makePosition({ quantity: 10, costPerUnit: 100, costInJPY: 150_000, currentValueJPY: 300_000 }),
            makePosition({ quantity: 5, costPerUnit: 120, costInJPY: 90_000, currentValueJPY: 150_000 }),
            makePosition({ account: 'nisa', costInJPY: 150_000, currentValueJPY: 300_000 }),
        ];

        const snapshot = createLiveSnapshot(positions, new Date());

        expect(snapshot.positionsCount).toBe(2);
        const merged = snapshot.positionDetails!.find(d => d.quantity === 15)!;
        expect(merged.costInJPY).toBe(240_000);
        expect(merged.valueInJPY).toBe(450_000);
        expect(merged.costPerUnit).toBeCloseTo((10 * 100 + 5 * 120) / 15);
        expect(snapshot.totalValueJPY).toBe(750_000);
    });

    it('handles empty positions', () => {
        const snapshot = createLiveSnapshot([], new Date());
        expect(snapshot.totalValueJPY).toBe(0);
        expect(snapshot.pnlPercentage).toBe(0);
        expect(snapshot.positionsCount).toBe(0);
    });
});
