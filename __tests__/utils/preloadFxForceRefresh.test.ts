/**
 * Guards that a forced refresh (the Refresh button) propagates all the way to
 * the current-FX fetch. Before this, `forceRefresh` reached stock prices but
 * not FX, so the current rate stayed frozen in cache and dev/prod never
 * converged. preloadFxRates must forward the flag to fetchCurrentFxRate.
 */

import type { RawPosition } from '@portfolio/types';
import { preloadFxRates } from '@portfolio/core';

jest.mock('@portfolio/core/yahooFinanceApi', () => ({
    fetchStockPrice: jest.fn(),
    updateAllPositions: jest.fn(),
    fetchCurrentFxRate: jest.fn().mockResolvedValue(159.887),
    fetchHistoricalFxRates: jest.fn().mockResolvedValue({}),
    fetchHistoricalDividends: jest.fn().mockResolvedValue(null),
    BASE_CURRENCY_CONSTANT: 'JPY',
}));

const usdPosition: RawPosition = {
    ticker: 'AAPL',
    fullName: 'Apple',
    transactionDate: '2023-01-01',
    quantity: 100,
    costPerUnit: 150,
    transactionCcy: 'JPY', // == base, so no historical FX pair is pulled
    stockCcy: 'USD', // open position quoted in USD -> current pair USDJPY
    account: 'Test',
    broker: 'Test',
} as unknown as RawPosition;

describe('preloadFxRates — forceRefresh propagation', () => {
    beforeEach(() => jest.clearAllMocks());

    it('forwards forceRefresh=true to the current-FX fetch', async () => {
        const { fetchCurrentFxRate } = require('@portfolio/core/yahooFinanceApi');

        await preloadFxRates([usdPosition], 'JPY', true);

        expect(fetchCurrentFxRate).toHaveBeenCalledWith('USDJPY', true);
    });

    it('defaults to forceRefresh=false (cached) when not forcing', async () => {
        const { fetchCurrentFxRate } = require('@portfolio/core/yahooFinanceApi');

        await preloadFxRates([usdPosition], 'JPY');

        expect(fetchCurrentFxRate).toHaveBeenCalledWith('USDJPY', false);
    });
});
