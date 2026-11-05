/** @jest-environment node */
import { runChatTool } from '../chatTools';
import { parseChatRequest } from '../chat';
import type { PortfolioSnapshot } from '../../../utils/portfolioSnapshot';

jest.mock('../../../app/api/historical-prices/route', () => ({
    GET: jest.fn(async (r: Request) => new Response(JSON.stringify({
        symbol: new URL(r.url).searchParams.get('symbol'), source: 'cache',
        prices: { '2026-10-01': 100, '2026-10-10': 120, '2026-10-15': 90, '2026-10-20': 110 },
    }), { status: 200 })),
}));
jest.mock('../../../app/api/dividends/route', () => ({
    GET: jest.fn(async () => new Response(JSON.stringify({
        dividends: { '2026-08-01': { amount: 0.25, currency: 'USD' }, '2025-01-01': { amount: 0.2, currency: 'USD' } },
    }))),
}));
jest.mock('../../../app/api/fx-rates/route', () => ({ GET: jest.fn(async () => new Response('{"error":"Invalid pair or date"}', { status: 400 })) }));
jest.mock('../../../app/api/prices/route', () => ({ GET: jest.fn(async () => new Response('{}')) }));
jest.mock('../../../app/api/ticker-info/route', () => ({ GET: jest.fn(async () => new Response('{}')) }));
jest.mock('../../../app/api/screener/quotes/route', () => ({ GET: jest.fn(async () => new Response('{}')) }));

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
const ctx = { snapshot };
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

describe('market_data range', () => {
    it('trims a long cached series to the requested window', async () => {
        const day = (ago: number) => new Date(Date.now() - ago * 86_400_000).toISOString().slice(0, 10);
        const { GET } = jest.requireMock('../../../app/api/historical-prices/route');
        GET.mockImplementationOnce(async () => new Response(JSON.stringify({
            symbol: 'AAPL', prices: { [day(400)]: 50, [day(100)]: 60, [day(20)]: 100, [day(1)]: 90 },
        })));
        const r = await call('market_data', { requests: [{ path: '/api/historical-prices', query: { symbol: 'AAPL', range: '30d' } }] });
        expect(r.data[0].data.prices).toMatchObject({ n: 2, first: 100, last: 90, changePct: -10 });
    });
});

describe('market_data', () => {
    const hp = (symbol: string) => ({ path: '/api/historical-prices', query: { symbol, range: '1y' } });

    it('summarises a price series from the existing route', async () => {
        const r = await call('market_data', { requests: [hp('AAPL')] });
        expect(r.data[0].data).toMatchObject({ symbol: 'AAPL', prices: { n: 4, first: 100, last: 110, changePct: 10 } });
        expect(r.data[0].data.prices.max).toEqual({ date: '2026-10-10', value: 120 });
    });

    it('batches several lookups and keeps latest dividends', async () => {
        const r = await call('market_data', { requests: [hp('AAPL'), hp('VTI'), { path: '/api/dividends', query: { symbol: 'AAPL' } }] });
        expect(r.data.map((x: { data: { symbol?: string } }) => x.data.symbol)).toEqual(['AAPL', 'VTI', undefined]);
        expect(r.data[2].data.dividends.latest[0]).toMatchObject({ date: '2026-08-01', amount: 0.25 });
    });

    it('reports route errors per request and refuses unlisted paths', async () => {
        const r = await call('market_data', { requests: [{ path: '/api/fx-rates', query: { pair: 'x' } }, { path: '/api/auth/me' }] });
        expect(r.data[0].error).toMatch(/Invalid pair/);
        expect(r.data[1].error).toMatch(/path must be one of/);
    });

    it('does not forward fresh or cachedOnly', async () => {
        const { GET } = jest.requireMock('../../../app/api/historical-prices/route');
        await call('market_data', { requests: [{ path: '/api/historical-prices', query: { symbol: 'AAPL', fresh: '1' } }] });
        const url = new URL((GET.mock.calls.at(-1)[0] as Request).url);
        expect(url.searchParams.has('fresh')).toBe(false);
    });

    it('rejects unknown tools and empty requests', async () => {
        expect((await call('drop_tables', {})).isError).toBe(true);
        expect((await call('market_data', {})).isError).toBe(true);
    });
});

describe('parseChatRequest snapshot', () => {
    const base = { brief: 'b', messages: [{ role: 'user', content: 'hi' }] };
    it('keeps a valid snapshot and drops a malformed one', () => {
        const ok = parseChatRequest({ ...base, snapshot });
        expect(ok.ok && ok.request.snapshot).toBeTruthy();
        const withNull = JSON.parse(JSON.stringify({ ...snapshot, holdings: [h('AAPL', { value: NaN })] }));
        const lenient = parseChatRequest({ ...base, snapshot: withNull });
        expect(lenient.ok && lenient.request.snapshot?.holdings[0].value).toBe(0);
        const dropped = parseChatRequest({ ...base, snapshot: { holdings: 'x' } });
        expect(dropped.ok && dropped.request.snapshot).toBeUndefined();
    });
});
