/**
 * Pinned-list (watchlist) backup: build → parse → merge round-trip, plus the
 * lenient inputs the importer accepts.
 */
import {
    buildWatchlistBackup, parseWatchlistBackup, mergeWatchlist, resolveConstituent,
    buildScreenerBackup, mergeScreenerBackup,
    DEFAULT_SCREENER_STATE, type ScreenerState,
} from '@/utils/screenerState';
import type { IndexConstituent } from '@/types/screener';

const INDEX: IndexConstituent[] = [
    { symbol: '8306.T', code: '8306', name: 'MUFG', sector: 'Banks' },
    { symbol: '7203.T', code: '7203', name: 'TOYOTA', sector: 'Autos' },
];
const AAPL: IndexConstituent = { symbol: 'AAPL', code: 'AAPL', name: 'Apple', sector: null };

const state = (over: Partial<ScreenerState>): ScreenerState => ({ ...DEFAULT_SCREENER_STATE, ...over });

describe('resolveConstituent', () => {
    it('prefers added, then index, then a bare fallback', () => {
        expect(resolveConstituent('AAPL', [AAPL], INDEX)).toBe(AAPL);
        expect(resolveConstituent('8306.T', [], INDEX).name).toBe('MUFG');
        expect(resolveConstituent('9999.T', [], INDEX)).toEqual({ symbol: '9999.T', code: '9999', name: '9999.T', sector: null });
    });
});

describe('buildWatchlistBackup', () => {
    it('returns undefined with no pins', () => {
        expect(buildWatchlistBackup(state({}), INDEX)).toBeUndefined();
    });

    it('carries names, notes and alerts for each pin in order', () => {
        const b = buildWatchlistBackup(state({
            pinned: ['AAPL', '8306.T'],
            added: [AAPL],
            notes: { '8306.T': 'cheap', '7203.T': 'not pinned' },
            alerts: { AAPL: { targetAbove: 200 } },
        }), INDEX)!;
        expect(b.version).toBe(1);
        expect(b.items).toEqual([
            { ...AAPL, alert: { targetAbove: 200 } },
            { ...INDEX[0], note: 'cheap' },
        ]);
    });
});

describe('parseWatchlistBackup', () => {
    it('accepts a backup object, an item array, or a symbol array', () => {
        expect(parseWatchlistBackup({ items: [{ symbol: 'AAPL', name: 'Apple' }] })?.[0].name).toBe('Apple');
        expect(parseWatchlistBackup([{ symbol: '8306.T' }])?.[0].code).toBe('8306');
        expect(parseWatchlistBackup(['7203.T', ' AAPL '])?.map(i => i.symbol)).toEqual(['7203.T', 'AAPL']);
    });

    it('migrates old-format alerts and drops junk', () => {
        const items = parseWatchlistBackup([{ symbol: 'X', alert: { target: 5, direction: 'below' } }, 42, { name: 'no symbol' }]);
        expect(items).toEqual([{ symbol: 'X', code: 'X', name: 'X', sector: null, alert: { targetBelow: 5 } }]);
    });

    it('returns null for unusable input', () => {
        expect(parseWatchlistBackup({ foo: 1 })).toBeNull();
        expect(parseWatchlistBackup([])).toBeNull();
        expect(parseWatchlistBackup(null)).toBeNull();
    });
});

describe('mergeWatchlist', () => {
    it('unions pins, adds non-index symbols, imported notes/alerts win', () => {
        const before = state({ pinned: ['7203.T'], notes: { '7203.T': 'keep', AAPL: 'old' } });
        const after = mergeWatchlist(before, [
            { ...INDEX[1] },
            { ...AAPL, note: 'new', alert: { targetBelow: 150 } },
            { ...INDEX[0] },
        ], INDEX);
        expect(after.pinned).toEqual(['7203.T', 'AAPL', '8306.T']);
        expect(after.added).toEqual([AAPL]);
        expect(after.notes).toEqual({ '7203.T': 'keep', AAPL: 'new' });
        expect(after.alerts).toEqual({ AAPL: { targetBelow: 150 } });
    });

    it('round-trips through build → JSON → parse → merge', () => {
        const src = state({ pinned: ['AAPL', '8306.T'], added: [AAPL], notes: { AAPL: 'n' } });
        const json = JSON.parse(JSON.stringify(buildWatchlistBackup(src, INDEX)));
        const restored = mergeWatchlist(state({}), parseWatchlistBackup(json)!, INDEX);
        expect(restored.pinned).toEqual(src.pinned);
        expect(restored.added).toEqual(src.added);
        expect(restored.notes).toEqual(src.notes);
    });
});

describe('full screener backup (portfolio export)', () => {
    it('is undefined when there is nothing to save', () => {
        expect(buildScreenerBackup(state({}))).toBeUndefined();
    });

    it('keeps notes/alerts on unpinned stocks and unpinned custom tickers', () => {
        const src = state({
            added: [AAPL],
            pinned: ['8306.T'],
            notes: { '7203.T': 'unpinned note' },
            alerts: { '7203.T': { targetAbove: 3000 } },
        });
        const json = JSON.parse(JSON.stringify(buildScreenerBackup(src)));
        const restored = mergeScreenerBackup(state({}), json);
        expect(restored.added).toEqual([AAPL]);
        expect(restored.pinned).toEqual(['8306.T']);
        expect(restored.notes).toEqual({ '7203.T': 'unpinned note' });
        expect(restored.alerts).toEqual({ '7203.T': { targetAbove: 3000 } });
    });

    it('merges into existing data without dropping it, and ignores junk', () => {
        const current = state({ pinned: ['7203.T'], notes: { '7203.T': 'mine', AAPL: 'old' }, indexLoaded: false });
        const merged = mergeScreenerBackup(current, {
            pinned: ['7203.T', 'AAPL', 42], added: [AAPL, { bad: true }], notes: { AAPL: 'new' }, indexLoaded: true,
        });
        expect(merged.pinned).toEqual(['7203.T', 'AAPL']);
        expect(merged.added).toEqual([AAPL]);
        expect(merged.notes).toEqual({ '7203.T': 'mine', AAPL: 'new' });
        expect(merged.indexLoaded).toBe(false);
        expect(mergeScreenerBackup(current, 'garbage')).toEqual(current);
    });
});
