import { buildScreenerSnapshot, formatScreenerMarkdown, MAX_NOTE_CHARS, MAX_NOTES_TOTAL_CHARS, MAX_SCREENER_ROWS, screenerHasData } from '../screenerSnapshot';
import { DEFAULT_SCREENER_STATE, type ScreenerState } from '../screenerState';
import type { StockFundamentals } from '../../types/screener';

const fund = (symbol: string, over: Partial<StockFundamentals> = {}): StockFundamentals => ({
    symbol, name: `${symbol} Corp`, price: 100, currency: 'JPY', trailingPE: 12.345, forwardPE: 11,
    dividendYield: 0.0345, priceToBook: 1.2, marketCap: 1_000_000, sector: 'Chemicals', ...over,
});
const done = (data: StockFundamentals) => ({ status: 'done', data });
const state = (over: Partial<ScreenerState> = {}): ScreenerState => ({ ...DEFAULT_SCREENER_STATE, ...over });
const NOW = new Date('2026-11-14T10:00:00Z');

describe('buildScreenerSnapshot', () => {
    it('turns loaded fundamentals into rows, converting yield to a percent', () => {
        const snap = buildScreenerSnapshot(state(), new Map([['4401.T', done(fund('4401.T'))]]), NOW);
        expect(snap).toMatchObject({ generatedAt: '2026-11-14', index: 'topix', loadedCount: 1, omitted: 0 });
        expect(snap.rows[0]).toMatchObject({ symbol: '4401.T', trailingPE: 12.35, dividendYieldPct: 3.45, loaded: true, pinned: false });
    });

    it('ignores entries that are loading or failed', () => {
        const snap = buildScreenerSnapshot(state(), new Map([['A', { status: 'loading' }], ['B', { status: 'error' }]]), NOW);
        expect(snap.rows).toEqual([]);
        expect(screenerHasData(snap)).toBe(false);
    });

    it('lists pinned stocks even before their data loads, ahead of bigger names', () => {
        const snap = buildScreenerSnapshot(
            state({ pinned: ['PIN'], added: [{ symbol: 'PIN', code: 'PIN', name: 'Pinned Co', sector: 'Retail' }] }),
            new Map([['BIG', done(fund('BIG', { marketCap: 9e12 }))]]), NOW);
        expect(snap.rows.map(r => r.symbol)).toEqual(['PIN', 'BIG']);
        expect(snap.rows[0]).toMatchObject({ name: 'Pinned Co', sector: 'Retail', loaded: false, price: null });
        expect(snap.loadedCount).toBe(1);
    });

    it('carries alerts and the user\'s notes, ignoring blank ones', () => {
        const snap = buildScreenerSnapshot(
            state({ alerts: { X: { targetAbove: 150 } }, notes: { X: '  my thesis: cheap vs peers  ', Y: '   ' } }),
            new Map([['X', done(fund('X'))], ['Y', done(fund('Y'))]]), NOW);
        const x = snap.rows.find(r => r.symbol === 'X')!;
        expect(x.alert).toEqual({ above: 150, below: undefined });
        expect(x).toMatchObject({ hasNote: true, note: 'my thesis: cheap vs peers' });
        expect(snap.rows.find(r => r.symbol === 'Y')).toMatchObject({ hasNote: false });
        expect(snap.rows.find(r => r.symbol === 'Y')!.note).toBeUndefined();
    });

    it('clips long notes', () => {
        const snap = buildScreenerSnapshot(state({ notes: { X: 'a'.repeat(MAX_NOTE_CHARS + 100) } }), new Map([['X', done(fund('X'))]]), NOW);
        expect(snap.rows[0].note).toHaveLength(MAX_NOTE_CHARS + 1);
        expect(snap.rows[0].note!.endsWith('…')).toBe(true);
    });

    it('stops attaching notes once the total budget is spent, pinned stocks first', () => {
        const count = Math.ceil(MAX_NOTES_TOTAL_CHARS / MAX_NOTE_CHARS) + 3;
        const symbols = Array.from({ length: count }, (_, i) => `S${i}`);
        const notes = Object.fromEntries(symbols.map(sym => [sym, 'n'.repeat(MAX_NOTE_CHARS)]));
        const snap = buildScreenerSnapshot(
            state({ notes, pinned: ['S0'] }),
            new Map(symbols.map((sym, i) => [sym, done(fund(sym, { marketCap: i }))] as const)), NOW);
        expect(snap.rows[0]).toMatchObject({ symbol: 'S0', pinned: true });
        expect(snap.rows[0].note).toBeDefined();
        expect(snap.notesOmitted).toBeGreaterThan(0);
        const kept = snap.rows.filter(r => r.note);
        expect(kept.length).toBeLessThan(count);
        expect(snap.rows.every(r => r.hasNote)).toBe(true);
    });

    it('caps the rows by market cap and says how many were left out', () => {
        const many = new Map(Array.from({ length: MAX_SCREENER_ROWS + 5 }, (_, i) =>
            [`S${i}`, done(fund(`S${i}`, { marketCap: i }))] as const));
        const snap = buildScreenerSnapshot(state(), many, NOW);
        expect(snap.rows).toHaveLength(MAX_SCREENER_ROWS);
        expect(snap.omitted).toBe(5);
        expect(snap.rows[0].symbol).toBe(`S${MAX_SCREENER_ROWS + 4}`);
    });
});

describe('formatScreenerMarkdown', () => {
    it('summarises counts and tabulates only the pinned stocks', () => {
        const md = formatScreenerMarkdown(buildScreenerSnapshot(
            state({ pinned: ['A'], alerts: { A: { targetBelow: 90 } } }),
            new Map([['A', done(fund('A'))], ['B', done(fund('B'))]]), NOW));
        expect(md).toContain('# Screener — TOPIX');
        expect(md).toContain('2 have fundamentals loaded, 1 pinned, 1 with price alerts');
        expect(md).toContain('| A | A Corp |');
        expect(md).toContain('≤90');
        expect(md).not.toContain('| B |');
    });

    it('quotes notes on pinned stocks, flattened to one line', () => {
        const md = formatScreenerMarkdown(buildScreenerSnapshot(
            state({ pinned: ['A'], notes: { A: 'buy below 90\nwatch margins', B: 'unpinned note' } }),
            new Map([['A', done(fund('A'))], ['B', done(fund('B'))]]), NOW));
        expect(md).toContain('## Notes on pinned stocks');
        expect(md).toContain('- A: buy below 90 watch margins');
        expect(md).not.toContain('unpinned note');
    });
});
