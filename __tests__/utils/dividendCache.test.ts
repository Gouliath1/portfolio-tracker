/**
 * @jest-environment node
 *
 * Round-trip + idempotency tests for the dividend slice of marketDataDb.
 *
 * Uses an in-memory libSQL client (`MARKET_DB_PATH=:memory:`) so we don't
 * touch ./data/marketCache.db. Forced to the node test environment because
 * @libsql/client pulls in undici-style globals not present in jsdom.
 */

// Force libSQL to use a fresh in-memory store before marketDataDb evaluates.
process.env.MARKET_DB_PATH = ':memory:';

import {
    getCachedDividendEvents,
    setCachedDividendEvents,
    getDividendRefreshedAt,
} from '../../src/lib/server/marketDataDb';

describe('marketDataDb dividend helpers — idempotent upsert', () => {
    const T = () => `TEST_${Math.random().toString(36).slice(2, 10)}`;

    it('round-trips events through the cache', async () => {
        const ticker = T();
        await setCachedDividendEvents(ticker, {
            '2024-02-09': { amount: 0.24, currency: 'USD' },
            '2024-05-10': { amount: 0.25, currency: 'USD' },
        });

        const got = await getCachedDividendEvents(ticker);
        expect(got).toEqual({
            '2024-02-09': { amount: 0.24, currency: 'USD' },
            '2024-05-10': { amount: 0.25, currency: 'USD' },
        });
    });

    it('upsert overwrites the amount on duplicate (ticker, ex_date)', async () => {
        const ticker = T();
        await setCachedDividendEvents(ticker, {
            '2024-02-09': { amount: 0.24, currency: 'USD' },
        });
        await setCachedDividendEvents(ticker, {
            '2024-02-09': { amount: 0.30, currency: 'USD' },
        });

        const got = await getCachedDividendEvents(ticker);
        expect(got).toEqual({
            '2024-02-09': { amount: 0.30, currency: 'USD' },
        });
    });

    it('records refreshed_at on every write, even when events is empty', async () => {
        const ticker = T();
        const before = Date.now();
        await setCachedDividendEvents(ticker, {});
        const refreshedAt = await getDividendRefreshedAt(ticker);
        expect(refreshedAt).not.toBeNull();
        expect(refreshedAt!.getTime()).toBeGreaterThanOrEqual(before - 1);
    });
});
