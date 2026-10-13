/** @jest-environment node */
import {
    parseSymbols, parseDates, isValidSymbol, isValidPair, isValidRange,
    overLimit, allowForcedRefresh, resetGuardsForTests, cdnCache,
} from '../requestGuards';

beforeEach(() => resetGuardsForTests());

describe('symbol validation', () => {
    it.each(['7203.T', 'AAPL', '^N225', 'BTC-USD', 'EURUSD=X'])('accepts %s', s => {
        expect(isValidSymbol(s)).toBe(true);
    });
    it.each(['', 'a/b', 'a?b=1', 'a b', '../x', 'A'.repeat(21), 'x\nhost'])('rejects %j', s => {
        expect(isValidSymbol(s)).toBe(false);
    });
    it('validates pairs and ranges', () => {
        expect(isValidPair('USDJPY')).toBe(true);
        expect(isValidPair('USD')).toBe(false);
        expect(isValidRange('5y')).toBe(true);
        expect(isValidRange('max')).toBe(true);
        expect(isValidRange('5y;drop')).toBe(false);
    });
});

describe('parseSymbols', () => {
    it('trims and dedupes', () => {
        expect(parseSymbols(' A, B ,A')).toEqual({ symbols: ['A', 'B'], rejected: false });
    });
    it('rejects over-cap lists and malformed entries', () => {
        expect(parseSymbols('A,B,C', 2).rejected).toBe(true);
        expect(parseSymbols('A,b/c').rejected).toBe(true);
    });
    it('treats empty as empty, not rejected', () => {
        expect(parseSymbols(null)).toEqual({ symbols: [], rejected: false });
    });
});

describe('parseDates', () => {
    it('accepts ISO dates and caps the count', () => {
        expect(parseDates('2024-01-01,2024-01-02')).toEqual(['2024-01-01', '2024-01-02']);
        expect(parseDates('2024-1-1')).toBeNull();
        expect(parseDates('2024-01-01,2024-01-02', 1)).toBeNull();
    });
});

describe('limiters', () => {
    it('overLimit trips after the limit and resets with the window', () => {
        expect(overLimit('k', 2, 1000, 0)).toBe(false);
        expect(overLimit('k', 2, 1000, 1)).toBe(false);
        expect(overLimit('k', 2, 1000, 2)).toBe(true);
        expect(overLimit('k', 2, 1000, 2000)).toBe(false);
    });
    it('allowForcedRefresh honours one forced refresh per cooldown', () => {
        expect(allowForcedRefresh('AAPL', 60_000, 0)).toBe(true);
        expect(allowForcedRefresh('AAPL', 60_000, 1_000)).toBe(false);
        expect(allowForcedRefresh('MSFT', 60_000, 1_000)).toBe(true);
        expect(allowForcedRefresh('AAPL', 60_000, 61_000)).toBe(true);
    });
});

it('cdnCache builds s-maxage headers', () => {
    expect(cdnCache(60, 300)['Cache-Control']).toBe('public, s-maxage=60, stale-while-revalidate=300');
});
