/**
 * Tests for fetchHistoricalDividends — Yahoo response parsing on the
 * server-side path (the path /api/dividends and refreshAll callers use).
 *
 * Cache helpers (set/getCachedDividendEvents) live in marketDataDb.ts which
 * pulls in @libsql/client; that needs the node test environment and lives
 * in a sibling file.
 */

import { fetchHistoricalDividends } from '../../src/lib/core/yahooFinanceApi';

declare const global: { fetch: jest.Mock };

const realWindow = (globalThis as { window?: unknown }).window;
beforeAll(() => {
    delete (globalThis as { window?: unknown }).window;
});
afterAll(() => {
    if (realWindow !== undefined) (globalThis as { window?: unknown }).window = realWindow;
});

// fetchJson inside yahooFinanceApi.ts caches by URL for 5 min across module
// state, so reusing a ticker between tests serves the first test's mock to
// the second. Unique tickers per test sidestep that.
let _ctr = 0;
const T = (label: string) => `T_${label}_${++_ctr}`;

describe('fetchHistoricalDividends — Yahoo response parsing', () => {
    beforeEach(() => {
        global.fetch = jest.fn();
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    const mockYahooResponse = (events: Record<string, { amount: number; date: number }>, currency = 'USD') => {
        global.fetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                chart: {
                    result: [{
                        meta: { currency },
                        events: { dividends: events },
                    }],
                },
            }),
        } as unknown as Response);
    };

    it('parses dividend events into { isoDate: { amount, currency } }', async () => {
        const sym = T('parse');
        const ex1 = Math.floor(new Date('2024-02-09T00:00:00Z').getTime() / 1000);
        const ex2 = Math.floor(new Date('2024-05-10T00:00:00Z').getTime() / 1000);

        mockYahooResponse({
            [String(ex1)]: { amount: 0.24, date: ex1 },
            [String(ex2)]: { amount: 0.25, date: ex2 },
        });

        const out = await fetchHistoricalDividends(sym, [
            { transactionDate: '2020-01-15', ticker: sym },
        ]);

        expect(out).toEqual({
            '2024-02-09': { amount: 0.24, currency: 'USD' },
            '2024-05-10': { amount: 0.25, currency: 'USD' },
        });
    });

    it('drops events older than the position\'s earliest transaction date', async () => {
        const sym = T('drop');
        const old = Math.floor(new Date('2018-08-10T00:00:00Z').getTime() / 1000);
        const recent = Math.floor(new Date('2024-02-09T00:00:00Z').getTime() / 1000);

        mockYahooResponse({
            [String(old)]: { amount: 0.18, date: old },
            [String(recent)]: { amount: 0.24, date: recent },
        });

        const out = await fetchHistoricalDividends(sym, [
            { transactionDate: '2020-01-15', ticker: sym },
        ]);

        expect(out).toEqual({
            '2024-02-09': { amount: 0.24, currency: 'USD' },
        });
    });

    it('returns null when Yahoo returns no dividend events', async () => {
        const sym = T('empty');
        mockYahooResponse({});
        const out = await fetchHistoricalDividends(sym, [
            { transactionDate: '2020-01-15', ticker: sym },
        ]);
        expect(out).toBeNull();
    });

    it('returns null when no positions match the symbol', async () => {
        const sym = T('nomatch');
        const out = await fetchHistoricalDividends(sym, [
            { transactionDate: '2020-01-15', ticker: 'OTHER' },
        ]);
        expect(out).toBeNull();
        expect(global.fetch).not.toHaveBeenCalled();
    });
});
