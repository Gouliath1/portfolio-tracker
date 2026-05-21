/**
 * Invariant tests for calculatePortfolioValueAtDate.
 *
 * Verifies the math behind the performance chart: in particular the claim
 * that "P&L curve sits above Value curve at all times" — if this is a real
 * data bug, the invariant `pnlJPY === totalValueJPY - totalCostJPY` would
 * fail. If the invariant holds, the visual mismatch is a dual-axis effect,
 * not a data error.
 */

import { calculatePortfolioValueAtDate } from '../../src/lib/core/historicalPortfolioCalculations';
import type { Position } from '../../src/types';

jest.mock('../../src/lib/core/yahooFinanceApi', () => ({
    fetchHistoricalPrices: jest.fn(),
    fetchHistoricalFxRates: jest.fn(),
}));

const mkPosition = (overrides: Partial<Position> = {}): Position => ({
    transactionDate: '2020-01-15',
    ticker: 'AAPL',
    fullName: 'Apple Inc.',
    account: 'Test',
    quantity: 10,
    costPerUnit: 100,
    transactionCcy: 'USD',
    stockCcy: 'USD',
    status: 'open',
    currentPrice: 150,
    costInJPY: 100_000,
    currentValueJPY: 150_000,
    pnlJPY: 50_000,
    pnlPercentage: 50,
    transactionFxRate: 100,
    currentFxRate: 100,
    dividendIncomeJPY: 0,
    totalReturnPercentage: 50,
    ...overrides,
});

describe('calculatePortfolioValueAtDate — math invariants', () => {
    it('returns all zeros when no positions exist at the target date (pre-purchase era)', async () => {
        const positions: Position[] = [
            mkPosition({ transactionDate: '2020-01-15' }),
        ];
        const targetDate = new Date('2010-01-01'); // years before any transaction

        const snap = await calculatePortfolioValueAtDate(positions, targetDate);

        expect(snap.totalValueJPY).toBe(0);
        expect(snap.totalCostJPY).toBe(0);
        expect(snap.pnlJPY).toBe(0);
        expect(snap.pnlPercentage).toBe(0);
        expect(snap.positionsCount).toBe(0);
    });

    it('keeps pnlJPY === totalValueJPY - totalCostJPY when positions exist', async () => {
        const positions: Position[] = [
            mkPosition({ transactionDate: '2020-01-15' }),
        ];
        const targetDate = new Date('2021-06-01');

        const priceCache = new Map<string, { [date: string]: number }>();
        priceCache.set('AAPL', { '2021-06-01': 140 });

        const fxCache = new Map<string, { [date: string]: number }>();

        const snap = await calculatePortfolioValueAtDate(
            positions,
            targetDate,
            priceCache,
            false,
            'JPY',
            fxCache,
        );

        expect(snap.pnlJPY).toBeCloseTo(
            snap.totalValueJPY - snap.totalCostJPY,
            6,
        );
    });

    it('never reports totalCostJPY < 0 or totalValueJPY < 0', async () => {
        const positions: Position[] = [
            mkPosition({ transactionDate: '2020-01-15', costInJPY: 100_000, quantity: 10 }),
            mkPosition({ transactionDate: '2020-06-15', ticker: 'GOOGL', costInJPY: 50_000, quantity: 5 }),
        ];

        const priceCache = new Map<string, { [date: string]: number }>();
        priceCache.set('AAPL', { '2021-01-01': 100 });
        priceCache.set('GOOGL', { '2021-01-01': 80 });

        const snap = await calculatePortfolioValueAtDate(
            positions,
            new Date('2021-01-01'),
            priceCache,
        );

        expect(snap.totalValueJPY).toBeGreaterThanOrEqual(0);
        expect(snap.totalCostJPY).toBeGreaterThanOrEqual(0);
    });

    it('reports pnlJPY = 0 exactly when totalCostJPY = 0 and totalValueJPY = 0', async () => {
        // Pre-purchase date — should hit the early-return zero branch.
        const positions: Position[] = [
            mkPosition({ transactionDate: '2025-01-01' }),
        ];
        const snap = await calculatePortfolioValueAtDate(
            positions,
            new Date('2024-12-31'),
        );

        expect(snap.totalCostJPY).toBe(0);
        expect(snap.totalValueJPY).toBe(0);
        expect(snap.pnlJPY).toBe(0);
    });

    it('totalValueJPY >= totalCostJPY when historical price > cost-per-unit (sanity for "Value >= P&L" intuition)', async () => {
        // Same currency, price moved up — value should exceed cost, P&L positive.
        const positions: Position[] = [
            mkPosition({
                transactionDate: '2020-01-15',
                stockCcy: 'JPY',
                transactionCcy: 'JPY',
                costPerUnit: 100,
                costInJPY: 1000,
                quantity: 10,
                transactionFxRate: 1,
            }),
        ];

        const priceCache = new Map<string, { [date: string]: number }>();
        priceCache.set('AAPL', { '2021-01-01': 200 }); // doubled

        const snap = await calculatePortfolioValueAtDate(
            positions,
            new Date('2021-01-01'),
            priceCache,
            false,
            'JPY',
        );

        expect(snap.totalValueJPY).toBe(2000);
        expect(snap.totalCostJPY).toBe(1000);
        expect(snap.pnlJPY).toBe(1000);
        // Value > P&L — the "Value above P&L" intuition holds in the data layer.
        expect(snap.totalValueJPY).toBeGreaterThan(snap.pnlJPY);
    });
});
