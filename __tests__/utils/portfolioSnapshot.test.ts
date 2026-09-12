/**
 * @jest-environment node
 *
 * Guards the portfolio → AI brief reduction. The brief is pasted into a chat
 * window and reasoned over, so the failure mode that matters isn't a crash —
 * it's a plausible-looking number that's quietly wrong. These tests pin the
 * arithmetic (aggregation, weights, total return) and the invariants a reader
 * of the markdown would assume hold.
 */

import { PortfolioSummary, Position } from '@portfolio/types';
import {
    buildSnapshot,
    formatSnapshotMarkdown,
} from '../../src/utils/portfolioSnapshot';

function makePosition(overrides: Partial<Position> = {}): Position {
    const base: Position = {
        transactionDate: '2023/01/10',
        ticker: 'AAPL',
        fullName: 'Apple Inc.',
        account: 'taxable',
        quantity: 10,
        costPerUnit: 100,
        transactionCcy: 'USD',
        stockCcy: 'USD',
        status: 'open',
        currentPrice: 150,
        costInJPY: 150_000,
        currentValueJPY: 225_000,
        pnlJPY: 75_000,
        pnlPercentage: 50,
        transactionFxRate: 150,
        currentFxRate: 150,
        dividendIncomeJPY: 0,
        totalReturnPercentage: 50,
    };
    return { ...base, ...overrides };
}

function makeSummary(overrides: Partial<PortfolioSummary> = {}): PortfolioSummary {
    const positions = overrides.positions ?? [];
    const closedPositions = overrides.closedPositions ?? [];
    const totalCostJPY = positions.reduce((s, p) => s + p.costInJPY, 0);
    const totalValueJPY = positions.reduce((s, p) => s + p.currentValueJPY, 0);
    const realizedCostJPY = closedPositions.reduce((s, p) => s + p.costInJPY, 0);
    const realizedPnlJPY = closedPositions.reduce((s, p) => s + (p.realizedPnlJPY ?? 0), 0);
    return {
        totalValueJPY,
        totalCostJPY,
        totalPnlJPY: totalValueJPY - totalCostJPY,
        totalPnlPercentage: totalCostJPY === 0 ? 0 : ((totalValueJPY - totalCostJPY) / totalCostJPY) * 100,
        positions,
        closedPositions,
        realizedPnlJPY,
        realizedCostJPY,
        realizedPnlPercentage: realizedCostJPY === 0 ? 0 : (realizedPnlJPY / realizedCostJPY) * 100,
        totalDividendsJPY: [...positions, ...closedPositions].reduce((s, p) => s + p.dividendIncomeJPY, 0),
        ...overrides,
    };
}

const FIXED_NOW = new Date('2026-09-11T00:00:00Z');

describe('buildSnapshot', () => {
    it('collapses multiple lots of the same ticker and account into one holding', () => {
        const summary = makeSummary({
            positions: [
                makePosition({ quantity: 10, costPerUnit: 100, costInJPY: 150_000, currentValueJPY: 225_000 }),
                makePosition({
                    transactionDate: '2022/06/01',
                    quantity: 30, costPerUnit: 200, costInJPY: 900_000, currentValueJPY: 675_000,
                }),
            ],
        });

        const snap = buildSnapshot(summary, 'JPY', { now: FIXED_NOW });

        expect(snap.holdings).toHaveLength(1);
        const [holding] = snap.holdings;
        expect(holding.quantity).toBe(40);
        expect(holding.value).toBe(900_000);
        expect(holding.cost).toBe(1_050_000);
        // Quantity-weighted: (10×100 + 30×200) / 40 = 175, not the 150 a plain mean gives.
        expect(holding.avgCost).toBe(175);
        // Earliest buy across the lots, not the first one encountered.
        expect(holding.heldSince).toBe('2022/06/01');
    });

    it('keeps the same ticker in different accounts as separate holdings', () => {
        const summary = makeSummary({
            positions: [
                makePosition({ account: 'taxable' }),
                makePosition({ account: 'nisa' }),
            ],
        });

        const snap = buildSnapshot(summary, 'JPY', { now: FIXED_NOW });

        expect(snap.holdings).toHaveLength(2);
        expect(snap.holdings.map(h => h.account).sort()).toEqual(['nisa', 'taxable']);
    });

    it('weights holdings against total value and sorts them largest first', () => {
        const summary = makeSummary({
            positions: [
                makePosition({ ticker: 'SMALL', currentValueJPY: 250_000, costInJPY: 250_000 }),
                makePosition({ ticker: 'BIG', currentValueJPY: 750_000, costInJPY: 750_000 }),
            ],
        });

        const snap = buildSnapshot(summary, 'JPY', { now: FIXED_NOW });

        expect(snap.holdings.map(h => h.ticker)).toEqual(['BIG', 'SMALL']);
        expect(snap.holdings.map(h => h.weightPct)).toEqual([75, 25]);
        // Fewer than five holdings: the top-5 figure is the whole book.
        expect(snap.top5Pct).toBe(100);
    });

    it('separates price-only return from total return when dividends are present', () => {
        const summary = makeSummary({
            positions: [
                makePosition({ costInJPY: 100_000, currentValueJPY: 110_000, dividendIncomeJPY: 5_000 }),
            ],
        });

        const snap = buildSnapshot(summary, 'JPY', { now: FIXED_NOW });

        expect(snap.holdings[0].pnlPct).toBe(10);
        expect(snap.holdings[0].totalReturnPct).toBe(15);
    });

    it('does not count closed-lot dividends twice', () => {
        // `realizedPnlJPY` arrives with the lot's dividends already folded in
        // (proceeds + dividends − cost), and `totalDividendsJPY` counts them
        // again. Reporting both verbatim overstates the portfolio; the brief
        // has to make the same split the Total P&L card does.
        const closed = makePosition({
            ticker: 'SOLD',
            status: 'closed',
            currentValueJPY: 0,
            costInJPY: 100_000,
            saleDate: '2025/03/01',
            dividendIncomeJPY: 4_000,
            proceedsJPY: 118_000,
            realizedPnlJPY: 22_000,  // 118k proceeds + 4k dividends − 100k cost
            realizedPnlPercentage: 22,
        });
        const summary = makeSummary({ positions: [], closedPositions: [closed] });

        const snap = buildSnapshot(summary, 'JPY', { now: FIXED_NOW });

        // Sales only — the 4k of dividends belongs to the dividend line.
        expect(snap.totals.realizedPnl).toBe(18_000);
        expect(snap.totals.dividends).toBe(4_000);
        expect(snap.recentClosed[0].realizedPnl).toBe(18_000);
        // 18k sales + 4k dividends over 100k deployed. Double-counting reads 26%.
        expect(snap.totals.totalReturnPct).toBe(22);
    });

    it('keeps the totals additive, matching the Total P&L card', () => {
        const summary = makeSummary({
            positions: [makePosition({ costInJPY: 200_000, currentValueJPY: 260_000, dividendIncomeJPY: 3_000 })],
            closedPositions: [makePosition({
                status: 'closed', currentValueJPY: 0, costInJPY: 50_000,
                saleDate: '2025/01/01', dividendIncomeJPY: 1_000, realizedPnlJPY: 11_000,
            })],
        });

        const { totals } = buildSnapshot(summary, 'JPY', { now: FIXED_NOW });

        const headline = totals.unrealizedPnl + totals.realizedPnl + totals.dividends;
        expect(headline).toBe(74_000); // 60k + 10k + 4k
        expect(totals.totalReturnPct).toBe(29.6); // 74k over 250k deployed
    });

    it('measures total return against open and closed cost combined', () => {
        const closed = makePosition({
            ticker: 'SOLD',
            status: 'closed',
            currentValueJPY: 0,
            costInJPY: 100_000,
            saleDate: '2025/03/01',
            realizedPnlJPY: 20_000,
            realizedPnlPercentage: 20,
        });
        const summary = makeSummary({
            positions: [makePosition({ costInJPY: 100_000, currentValueJPY: 130_000 })],
            closedPositions: [closed],
        });

        const snap = buildSnapshot(summary, 'JPY', { now: FIXED_NOW });

        // 30k unrealized + 20k realized over 200k deployed — crediting the
        // realized gain against the open book alone would read 50%.
        expect(snap.totals.totalReturnPct).toBe(25);
        expect(snap.closedCount).toBe(1);
        expect(snap.recentClosed[0].ticker).toBe('SOLD');
    });

    it('breaks allocation down by class, listing currency and account', () => {
        const summary = makeSummary({
            positions: [
                makePosition({ ticker: 'AAPL', stockCcy: 'USD', account: 'taxable', currentValueJPY: 600_000 }),
                makePosition({ ticker: '7203.T', stockCcy: 'JPY', account: 'nisa', currentValueJPY: 400_000 }),
            ],
        });

        const snap = buildSnapshot(summary, 'JPY', {
            now: FIXED_NOW,
            assetClasses: { AAPL: 'Equity', '7203.T': 'Equity' },
        });

        expect(snap.byAssetClass).toEqual([{ label: 'Equity', value: 1_000_000, pct: 100 }]);
        expect(snap.byCurrency).toEqual([
            { label: 'USD', value: 600_000, pct: 60 },
            { label: 'JPY', value: 400_000, pct: 40 },
        ]);
        expect(snap.byAccount.map(a => a.label)).toEqual(['taxable', 'nisa']);
    });

    it('falls back to Other for tickers with no resolved asset class', () => {
        const summary = makeSummary({ positions: [makePosition({ ticker: 'MYSTERY' })] });

        const snap = buildSnapshot(summary, 'JPY', { now: FIXED_NOW, assetClasses: {} });

        expect(snap.holdings[0].assetClass).toBe('Other');
    });

    it('rounds to minor units only for currencies that have them', () => {
        const positions = [makePosition({ currentValueJPY: 1234.567, costInJPY: 1000 })];

        expect(buildSnapshot(makeSummary({ positions }), 'JPY', { now: FIXED_NOW }).totals.value)
            .toBe(1235);
        expect(buildSnapshot(makeSummary({ positions }), 'USD', { now: FIXED_NOW }).totals.value)
            .toBe(1234.57);
    });

    it('survives an empty portfolio without dividing by zero', () => {
        const snap = buildSnapshot(makeSummary(), 'JPY', { now: FIXED_NOW });

        expect(snap.holdings).toEqual([]);
        expect(snap.totals.value).toBe(0);
        expect(snap.totals.totalReturnPct).toBe(0);
        expect(snap.top5Pct).toBe(0);
        expect(Number.isNaN(snap.totals.unrealizedPnlPct)).toBe(false);
    });

    it('caps the closed list and orders it most-recent-first', () => {
        const closedPositions = ['2024/01/01', '2025/06/01', '2023/01/01'].map(saleDate =>
            makePosition({
                ticker: `T${saleDate.slice(0, 4)}`,
                status: 'closed', currentValueJPY: 0, saleDate,
                realizedPnlJPY: 1_000, realizedPnlPercentage: 1,
            }),
        );

        const snap = buildSnapshot(makeSummary({ closedPositions }), 'JPY', {
            now: FIXED_NOW, recentClosedLimit: 2,
        });

        expect(snap.recentClosed.map(c => c.soldOn)).toEqual(['2025/06/01', '2024/01/01']);
        expect(snap.closedCount).toBe(3);
    });

    it('reports a missing price as null rather than inventing a number', () => {
        const summary = makeSummary({
            positions: [makePosition({ currentPrice: null, currentValueJPY: 0 })],
        });

        expect(buildSnapshot(summary, 'JPY', { now: FIXED_NOW }).holdings[0].price).toBeNull();
    });
});

describe('formatSnapshotMarkdown', () => {
    const summary = makeSummary({
        positions: [
            makePosition({ ticker: 'AAPL', currentValueJPY: 600_000, costInJPY: 500_000 }),
            makePosition({ ticker: '7203.T', fullName: 'Toyota', stockCcy: 'JPY', account: 'nisa', currentValueJPY: 400_000, costInJPY: 500_000 }),
        ],
    });

    it('renders every holding as its own table row', () => {
        const md = formatSnapshotMarkdown(buildSnapshot(summary, 'JPY', { now: FIXED_NOW }));

        expect(md).toContain('| AAPL |');
        expect(md).toContain('| 7203.T |');
        // Header + separator + one row per holding.
        expect(md.split('\n').filter(l => l.startsWith('|'))).toHaveLength(4);
    });

    it('states the base currency and generation date so staleness is visible', () => {
        const md = formatSnapshotMarkdown(buildSnapshot(summary, 'JPY', { now: FIXED_NOW }));

        expect(md).toContain('Generated 2026-09-11');
        expect(md).toContain('amounts in JPY');
    });

    it('signs gains and losses explicitly', () => {
        const md = formatSnapshotMarkdown(buildSnapshot(summary, 'JPY', { now: FIXED_NOW }));

        expect(md).toContain('+20%');  // AAPL: 500k → 600k
        expect(md).toContain('-20%');  // Toyota: 500k → 400k
    });

    it('closes with an explicit ask rather than leaving the model to guess', () => {
        const md = formatSnapshotMarkdown(buildSnapshot(summary, 'JPY', { now: FIXED_NOW }));

        expect(md).toContain('## What I want');
        expect(md).toMatch(/say so rather than guessing/);
    });

    it('omits the closed-positions section when nothing has been sold', () => {
        const md = formatSnapshotMarkdown(buildSnapshot(summary, 'JPY', { now: FIXED_NOW }));

        expect(md).not.toContain('## Recently closed');
    });
});
