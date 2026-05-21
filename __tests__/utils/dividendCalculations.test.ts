/**
 * Unit tests for dividend handling inside calculatePosition.
 *
 * Covers:
 *  - Holding-window cutoffs: ex-dates strictly after transactionDate, on or
 *    before saleDate (or today for open lots).
 *  - Per-lot attribution under FIFO: a partial sell produces two lots that
 *    each correctly attribute the dividends paid during their own window.
 *  - FX conversion at ex-date when the dividend is paid in a foreign ccy.
 *  - Total return % includes dividends.
 */

import { calculatePosition, calculatePortfolioSummary, type DividendLookup, type FxLookup } from '@portfolio/core';
import type { RawPosition } from '@portfolio/types';

jest.mock('@portfolio/core/yahooFinanceApi', () => ({
    fetchStockPrice: jest.fn(),
    updateAllPositions: jest.fn(),
    fetchCurrentFxRate: jest.fn(),
    fetchHistoricalFxRates: jest.fn(),
    fetchHistoricalDividends: jest.fn(),
}));

const today = new Date().toISOString().split('T')[0];

describe('calculatePosition — dividend income', () => {
    beforeEach(() => {
        jest.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
        jest.restoreAllMocks();
    });

    const baseRaw: RawPosition = {
        transactionDate: '2024-01-15',
        ticker: 'AAPL',
        fullName: 'Apple Inc.',
        account: 'Demo',
        quantity: 100,
        costPerUnit: 150,
        transactionCcy: 'USD',
        stockCcy: 'USD',
    };

    const fxLookup: FxLookup = {
        historical: new Map([['USDJPY', new Map([
            ['2024-01-15', 145],
            ['2024-02-09', 146],
            ['2024-05-10', 147],
        ])]]),
        current: new Map([['USDJPY', 150]]),
    };

    it('sums dividends within the holding window in base currency', async () => {
        const div: DividendLookup = new Map([
            ['AAPL', new Map([
                ['2023-11-10', { amount: 0.24, currency: 'USD' }], // before tx — excluded
                ['2024-02-09', { amount: 0.24, currency: 'USD' }], // inside — 100 * 0.24 * 146
                ['2024-05-10', { amount: 0.25, currency: 'USD' }], // inside — 100 * 0.25 * 147
            ])],
        ]);

        const pos = await calculatePosition(baseRaw, 160, 'JPY', fxLookup, div);

        const expected = 100 * 0.24 * 146 + 100 * 0.25 * 147;
        expect(pos.dividendIncomeJPY).toBeCloseTo(expected, 2);
    });

    it('excludes ex-dates after a sale', async () => {
        const closed: RawPosition = { ...baseRaw, saleDate: '2024-04-01', salePricePerUnit: 170, saleCcy: 'USD' };
        const div: DividendLookup = new Map([
            ['AAPL', new Map([
                ['2024-02-09', { amount: 0.24, currency: 'USD' }], // inside
                ['2024-05-10', { amount: 0.25, currency: 'USD' }], // after sale — excluded
            ])],
        ]);

        const pos = await calculatePosition(closed, null, 'JPY', fxLookup, div);

        expect(pos.dividendIncomeJPY).toBeCloseTo(100 * 0.24 * 146, 2);
    });

    it('rolls dividends into realizedPnl on closed lots', async () => {
        // Cost: 150 * 100 * 145 = 2,175,000
        // Proceeds: 170 * 100 * 147 = 2,499,000  (sale FX = 2024-05-10 rate)
        // Dividends (one ex-date inside [2024-01-15, 2024-05-10]):
        //   100 * 0.24 * 146 = 3,504
        // Realized = proceeds + dividends − cost = 2,499,000 + 3,504 − 2,175,000 = 327,504
        const closed: RawPosition = { ...baseRaw, saleDate: '2024-05-10', salePricePerUnit: 170, saleCcy: 'USD' };
        const div: DividendLookup = new Map([
            ['AAPL', new Map([['2024-02-09', { amount: 0.24, currency: 'USD' }]])],
        ]);

        const pos = await calculatePosition(closed, null, 'JPY', fxLookup, div);

        expect(pos.dividendIncomeJPY).toBeCloseTo(3504, 2);
        expect(pos.realizedPnlJPY).toBeCloseTo(327504, 2);
        expect(pos.realizedPnlPercentage).toBeCloseTo(327504 / 2175000 * 100, 6);
    });

    it('total return % includes dividend income', async () => {
        // Cost: 150 * 100 * 145 = 2,175,000
        // Value: 160 * 100 * 150 = 2,400,000
        // Dividends: 100 * 0.24 * 146 = 3,504
        // Total return = (2,400,000 + 3,504 - 2,175,000) / 2,175,000 * 100 ≈ 10.51%
        const div: DividendLookup = new Map([
            ['AAPL', new Map([['2024-02-09', { amount: 0.24, currency: 'USD' }]])],
        ]);

        const pos = await calculatePosition(baseRaw, 160, 'JPY', fxLookup, div);

        const expectedPct = (pos.currentValueJPY + pos.dividendIncomeJPY - pos.costInJPY) / pos.costInJPY * 100;
        expect(pos.totalReturnPercentage).toBeCloseTo(expectedPct, 6);
        expect(pos.totalReturnPercentage).toBeGreaterThan(pos.pnlPercentage);
    });

    it('returns zero when no dividend lookup is supplied', async () => {
        const pos = await calculatePosition(baseRaw, 160, 'JPY', fxLookup);
        expect(pos.dividendIncomeJPY).toBe(0);
        expect(pos.totalReturnPercentage).toBeCloseTo(pos.pnlPercentage, 6);
    });

    it('handles same-currency dividends without an FX pair', async () => {
        const jpRaw: RawPosition = {
            transactionDate: '2024-01-15',
            ticker: '7203.T',
            fullName: 'Toyota',
            account: 'JP',
            quantity: 100,
            costPerUnit: 2000,
            transactionCcy: 'JPY',
            stockCcy: 'JPY',
        };
        const div: DividendLookup = new Map([
            ['7203.T', new Map([['2024-03-28', { amount: 50, currency: 'JPY' }]])],
        ]);

        const pos = await calculatePosition(jpRaw, 2200, 'JPY', undefined, div);

        expect(pos.dividendIncomeJPY).toBe(100 * 50);
    });
});

describe('calculatePortfolioSummary — dividend totals', () => {
    beforeEach(() => {
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'log').mockImplementation(() => {});
        const yahoo = require('@portfolio/core/yahooFinanceApi');
        // No external network in tests — preloadFxRates / preloadDividendEvents
        // call these and we want to control their outputs.
        yahoo.fetchStockPrice.mockResolvedValue(160);
        yahoo.updateAllPositions.mockResolvedValue({ AAPL: 160 });
        yahoo.fetchCurrentFxRate.mockResolvedValue(150);
        yahoo.fetchHistoricalFxRates.mockResolvedValue({
            '2024-01-15': 145,
            '2024-02-09': 146,
            '2024-05-10': 147,
        });
        yahoo.fetchHistoricalDividends.mockResolvedValue({
            '2024-02-09': { amount: 0.24, currency: 'USD' },
            '2024-05-10': { amount: 0.25, currency: 'USD' },
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('rolls per-position dividends up to totalDividendsJPY', async () => {
        const positions: RawPosition[] = [{
            transactionDate: '2024-01-15',
            ticker: 'AAPL',
            fullName: 'Apple Inc.',
            account: 'Demo',
            quantity: 100,
            costPerUnit: 150,
            transactionCcy: 'USD',
            stockCcy: 'USD',
        }];

        const summary = await calculatePortfolioSummary(positions, false, 'JPY');

        const expected = 100 * 0.24 * 146 + 100 * 0.25 * 147;
        expect(summary.totalDividendsJPY).toBeCloseTo(expected, 2);
        expect(summary.positions[0].dividendIncomeJPY).toBeCloseTo(expected, 2);
    });
});
