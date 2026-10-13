/** @jest-environment node */
import { marketDay } from '../dateUtils';

const fetchChartMeta = jest.fn();
const fetchQuoteSummary = jest.fn();
jest.mock('@portfolio/core', () => ({ fetchChartMeta: (...a: unknown[]) => fetchChartMeta(...a) }));
jest.mock('../jquantsApi', () => ({ fetchJQuantsRatios: jest.fn() }));
jest.mock('../yahooAuth', () => ({
    fetchQuoteSummary: (...a: unknown[]) => fetchQuoteSummary(...a),
    fetchYahooSector: jest.fn().mockResolvedValue(null),
}));

import { isPriceFresh, refreshSymbol, type CachedRow } from '../screenerRefresh';

const row = (fetchedAt: string, ratiosFetchedAt: string | null = fetchedAt): CachedRow => ({
    data: {
        symbol: 'X', name: 'X Co', price: 100, currency: 'JPY',
        trailingPE: 10, forwardPE: 9, dividendYield: 0.02, priceToBook: 1, marketCap: 1e9, sector: 'Tech',
    },
    fetchedAt, ratiosFetchedAt,
});

beforeEach(() => {
    fetchChartMeta.mockReset();
    fetchQuoteSummary.mockReset();
    fetchChartMeta.mockResolvedValue({ price: 111, currency: 'JPY', name: 'X Co' });
    fetchQuoteSummary.mockResolvedValue({
        trailingPE: 11, forwardPE: 10, dividendYield: 0.03, priceToBook: 2, marketCap: 2e9, sector: 'Tech',
    });
});

describe('marketDay', () => {
    it('is the New York calendar date on a weekday', () => {
        expect(marketDay('2026-10-12T15:00:00Z')).toBe('2026-10-12'); // Monday
    });
    it('rolls weekends back to Friday so Saturday/Sunday share Friday\'s close', () => {
        expect(marketDay('2026-10-10T15:00:00Z')).toBe('2026-10-09'); // Saturday
        expect(marketDay('2026-10-11T15:00:00Z')).toBe('2026-10-09'); // Sunday
    });
    it('uses New York time, not UTC, for the date boundary', () => {
        expect(marketDay('2026-10-13T02:00:00Z')).toBe('2026-10-12'); // still Monday evening in NY
    });
});

describe('isPriceFresh', () => {
    const now = Date.parse('2026-10-12T18:00:00Z');
    it('same market day → fresh, regardless of time of day', () => {
        expect(isPriceFresh('2026-10-12T13:30:00Z', {}, now)).toBe(true);
    });
    it('previous market day → stale (next day asks for the new close)', () => {
        expect(isPriceFresh('2026-10-09T20:00:00Z', {}, now)).toBe(false);
    });
    it('an explicit max age overrides the same-day rule (alert polling)', () => {
        expect(isPriceFresh('2026-10-12T17:50:00Z', { priceMaxAgeMs: 30 * 60_000 }, now)).toBe(true);
        expect(isPriceFresh('2026-10-12T16:00:00Z', { priceMaxAgeMs: 30 * 60_000 }, now)).toBe(false);
    });
    it('missing timestamp is never fresh', () => {
        expect(isPriceFresh(null, {}, now)).toBe(false);
    });
});

describe('refreshSymbol', () => {
    it('does not touch upstream when price and ratios are fresh', async () => {
        const nowIso = new Date().toISOString();
        const o = await refreshSymbol('X', row(nowIso), {});
        expect(o.touchedUpstream).toBe(false);
        expect(o.write).toBeNull();
        expect(o.source).toBe('cache');
        expect(fetchChartMeta).not.toHaveBeenCalled();
        expect(fetchQuoteSummary).not.toHaveBeenCalled();
    });

    it('fetches both tiers when stale and returns rows to persist (no direct writes)', async () => {
        const old = '2020-01-01T00:00:00Z';
        const o = await refreshSymbol('X', row(old), {});
        expect(o.touchedUpstream).toBe(true);
        expect(o.result.price).toBe(111);
        expect(o.write).toMatchObject({ ticker: 'X', price: { price: 111 }, ratios: { trailingPE: 11 } });
    });

    it('price-only tier skips the ratios call', async () => {
        const o = await refreshSymbol('X', row('2020-01-01T00:00:00Z', '2020-01-01T00:00:00Z'), { priceOnly: true });
        expect(fetchQuoteSummary).not.toHaveBeenCalled();
        expect(o.write?.ratios).toBeUndefined();
    });

    it('concurrent requests for one symbol share a single upstream fetch', async () => {
        let release!: () => void;
        fetchChartMeta.mockImplementation(() => new Promise(r => { release = () => r({ price: 5, currency: 'JPY', name: 'N' }); }));
        const a = refreshSymbol('Y', null, { priceOnly: true });
        const b = refreshSymbol('Y', null, { priceOnly: true });
        const c = refreshSymbol('Y', null, { priceOnly: true });
        release();
        await Promise.all([a, b, c]);
        expect(fetchChartMeta).toHaveBeenCalledTimes(1);
    });

    it('force refetches even when fresh', async () => {
        const o = await refreshSymbol('X', row(new Date().toISOString()), { forceFresh: true });
        expect(o.touchedUpstream).toBe(true);
        expect(fetchChartMeta).toHaveBeenCalledTimes(1);
    });

    it('reports failure when nothing is cached and upstream returns nothing', async () => {
        fetchChartMeta.mockResolvedValue(null);
        fetchQuoteSummary.mockRejectedValue(new Error('crumb'));
        const o = await refreshSymbol('Z', null, {});
        expect(o.failed).toBe(true);
        expect(o.ratiosError).toBe('crumb');
    });
});
