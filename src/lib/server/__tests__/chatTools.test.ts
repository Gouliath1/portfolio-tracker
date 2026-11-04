/** @jest-environment node */
import { runChatTool } from '../chatTools';
import { parseChatRequest } from '../chat';
import type { PortfolioSnapshot } from '../../../utils/portfolioSnapshot';

jest.mock('../marketDataDb', () => ({
    getCachedHistoricalPrices: jest.fn(async (t: string) => t === 'AAPL'
        ? { '2026-09-01': 100, '2026-09-15': 120, '2026-10-01': 90, '2026-10-20': 110 } : {}),
    getCachedFundamentalsBatch: jest.fn(async () => new Map([['AAPL', {
        data: { name: 'Apple', price: 110, currency: 'USD', sector: 'Tech', trailingPE: 30.123, forwardPE: 27, priceToBook: 40, dividendYield: 0.5, marketCap: 1e12 },
        fetchedAt: '2026-10-20', ratiosFetchedAt: '2026-10-19T00:00:00Z',
    }]])),
    getCachedDividendEvents: jest.fn(async () => ({
        '2026-08-01': { amount: 0.25, currency: 'USD' }, '2025-01-01': { amount: 0.2, currency: 'USD' },
    })),
}));

const h = (ticker: string, over: Partial<PortfolioSnapshot['holdings'][number]> = {}) => ({
    ticker, name: ticker, account: 'Main', assetClass: 'Equity', stockCcy: 'USD', quantity: 1, avgCost: 1,
    price: 1, value: 100, cost: 80, weightPct: 10, pnlPct: 25, totalReturnPct: 25, dividends: 0,
    heldSince: '2024-01-01', ...over,
}) as PortfolioSnapshot['holdings'][number];

const snapshot = {
    baseCurrency: 'JPY', closedCount: 12,
    holdings: [h('AAPL', { value: 300 }), h('VTI', { value: 500, account: 'NISA', assetClass: 'Fund' }), h('SONY', { value: 100, stockCcy: 'JPY', pnlPct: -5 })],
    recentClosed: [{ ticker: 'TSLA', name: 'Tesla', account: 'Main', soldOn: '2026-01-01', realizedPnl: 5, realizedPnlPct: 2 }],
} as unknown as PortfolioSnapshot;
const ctx = { snapshot, now: new Date('2026-10-25') };
const call = async (name: string, input: unknown, c = ctx) => {
    const r = await runChatTool(name, input, c);
    return { ...r, data: r.isError ? null : JSON.parse(r.text) };
};

describe('portfolio tools', () => {
    it('filters and sorts holdings', async () => {
        const all = await call('query_holdings', {});
        expect(all.data.holdings.map((x: { ticker: string }) => x.ticker)).toEqual(['VTI', 'AAPL', 'SONY']);
        const fund = await call('query_holdings', { account: 'nisa' });
        expect(fund.data.matched).toBe(1);
        const worst = await call('query_holdings', { sortBy: 'pnlPct', order: 'asc', limit: 1 });
        expect(worst.data.holdings[0].ticker).toBe('SONY');
    });

    it('looks up holdings and reports tickers not held', async () => {
        const r = await call('get_holding', { tickers: ['aapl', 'TSLA'] });
        expect(r.data.holdings).toHaveLength(1);
        expect(r.data.sold[0].ticker).toBe('TSLA');
        expect(r.data.notHeld).toEqual(['tsla']);
    });

    it('flags truncated sales history', async () => {
        expect((await call('get_closed_positions', {})).data.note).toMatch(/1 most recent/);
    });

    it('errors cleanly without a snapshot', async () => {
        const r = await runChatTool('query_holdings', {}, { snapshot: null });
        expect(r.isError).toBe(true);
    });
});

describe('market-data tools', () => {
    it('summarises price history', async () => {
        const r = await call('get_price_history', { ticker: 'AAPL', range: '3m' });
        expect(r.data.changePct).toBe(10);
        expect(r.data.high.price).toBe(120);
        expect(r.data.maxDrawdownPct).toBe(-25);
        expect(r.data.points).toHaveLength(12);
    });

    it('reports missing history and rejects bad input', async () => {
        expect((await call('get_price_history', { ticker: 'NOPE' })).data.available).toBe(false);
        expect((await call('get_price_history', { ticker: 'bad symbol!' })).isError).toBe(true);
        expect((await call('get_price_history', { ticker: 'AAPL', range: '9y' })).isError).toBe(true);
    });

    it('returns fundamentals and dividends', async () => {
        expect((await call('get_fundamentals', { tickers: ['AAPL'] })).data[0].trailingPE).toBe(30.12);
        expect((await call('get_dividends', { ticker: 'AAPL' })).data.trailing12mPerShare).toBe(0.25);
    });

    it('rejects unknown tools', async () => {
        expect((await call('drop_tables', {})).isError).toBe(true);
    });
});

describe('parseChatRequest snapshot', () => {
    const base = { brief: 'b', messages: [{ role: 'user', content: 'hi' }] };
    it('keeps a valid snapshot and drops a malformed one', () => {
        const ok = parseChatRequest({ ...base, snapshot });
        expect(ok.ok && ok.request.snapshot).toBeTruthy();
        const dropped = parseChatRequest({ ...base, snapshot: { holdings: 'x' } });
        expect(dropped.ok && dropped.request.snapshot).toBeUndefined();
    });
});
