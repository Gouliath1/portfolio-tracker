/** @jest-environment node */
import { CHAT_TOOLS, buildChatTools, runChatTool } from '../chatTools';
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

describe('query_screener', () => {
    const row = (symbol: string, over: object = {}) => ({
        symbol, name: `${symbol} Corp`, sector: 'Chemicals', price: 100, currency: 'JPY', trailingPE: 10, forwardPE: 9,
        dividendYieldPct: 2, priceToBook: 1, marketCap: 1000, pinned: false, hasNote: false, loaded: true, ...over,
    });
    const screener = {
        generatedAt: '2026-11-14', index: 'topix', loadedCount: 4, pinnedCount: 1, alertCount: 0, omitted: 0,
        rows: [row('A', { marketCap: 500, trailingPE: 25, dividendYieldPct: 5 }), row('B', { marketCap: 900, trailingPE: 8, sector: 'Banks', pinned: true, hasNote: true, note: 'Watching the dividend cut risk' }),
            row('C', { marketCap: 100, trailingPE: null }), row('D', { marketCap: 700, trailingPE: -3, dividendYieldPct: 1 })],
    } as never;
    const q = (input: object) => runChatTool('query_screener', input, { snapshot: null, screener }).then(r => ({ ...r, data: r.isError ? null : JSON.parse(r.text) }));
    const symbols = (d: { stocks: { symbol: string }[] }) => d.stocks.map(s => s.symbol);

    it('ranks by market cap by default and by P/E ascending, missing values last', async () => {
        expect(symbols((await q({})).data)).toEqual(['B', 'D', 'A', 'C']);
        expect(symbols((await q({ sortBy: 'trailingPE' })).data)).toEqual(['D', 'B', 'A', 'C']);
    });

    it('filters by sector, pins, yield and P/E (a negative P/E is not cheap)', async () => {
        expect(symbols((await q({ sector: 'banks' })).data)).toEqual(['B']);
        expect(symbols((await q({ pinnedOnly: true })).data)).toEqual(['B']);
        expect(symbols((await q({ minYieldPct: 3 })).data)).toEqual(['A']);
        expect(symbols((await q({ maxPE: 30, sortBy: 'trailingPE' })).data)).toEqual(['B', 'A']);
        expect(symbols((await q({ search: 'c corp' })).data)).toEqual(['C']);
    });

    it('finds stocks by what the user wrote, and returns the note', async () => {
        const byNote = (await q({ search: 'dividend cut' })).data;
        expect(symbols(byNote)).toEqual(['B']);
        expect(byNote.stocks[0].note).toBe('Watching the dividend cut risk');
        const noted = (await q({ hasNote: true })).data;
        expect(symbols(noted)).toEqual(['B']);
    });

    it('errors cleanly when the user is not on the screener', async () => {
        const r = await runChatTool('query_screener', {}, { snapshot: null });
        expect(r.isError).toBe(true);
        expect(r.text).toMatch(/screener/);
    });
});

describe('market_data windows', () => {
    const NOW = new Date(2026, 10, 5, 12);
    const longHistory = (sym = 'AAPL') => new Response(JSON.stringify({
        symbol: sym, prices: {
            '2026-07-01': 50, '2026-08-31': 100, '2026-09-10': 120, '2026-09-30': 90, '2026-10-14': 95, '2026-11-04': 130,
        },
    }));
    const lastUrl = () => {
        const { GET } = jest.requireMock('../../../app/api/historical-prices/route');
        return new URL((GET.mock.calls.at(-1)[0] as Request).url);
    };
    const run = (req: object) => runChatTool('market_data', { requests: [req] }, { snapshot, now: NOW })
        .then(r => JSON.parse(r.text)[0]);

    const serve = () => jest.requireMock('../../../app/api/historical-prices/route').GET.mockImplementationOnce(async () => longHistory());

    it('summarises a month two months back, measured from the prior close', async () => {
        serve();
        const r = await run({ path: '/api/historical-prices', from: '2026-09-01', to: '2026-09-30', query: { symbol: 'AAPL' } });
        expect(r.data.prices).toMatchObject({ n: 3, from: '2026-08-31', to: '2026-09-30', first: 100, last: 90, changePct: -10 });
        expect(lastUrl().searchParams.get('range')).toBe('74d');
    });

    it('handles a 2-week window and a trailing range', async () => {
        serve();
        const two = await run({ path: '/api/historical-prices', from: '2026-10-20', query: { symbol: 'AAPL' } });
        expect(two.data.prices).toMatchObject({ from: '2026-10-14', to: '2026-11-04', changePct: expect.closeTo(36.84, 1) });
        serve();
        const trailing = await run({ path: '/api/historical-prices', query: { symbol: 'AAPL', range: '60d' } });
        expect(trailing.data.prices.from).toBe('2026-08-31');
    });

    it('rejects malformed or reversed dates', async () => {
        expect((await run({ path: '/api/historical-prices', from: '2026-9-1', query: { symbol: 'AAPL' } })).error).toMatch(/YYYY-MM-DD/);
        expect((await run({ path: '/api/historical-prices', from: '2026-10-01', to: '2026-09-01', query: { symbol: 'AAPL' } })).error).toMatch(/from <= to/);
    });

    it('reports an empty window', async () => {
        serve();
        const r = await run({ path: '/api/historical-prices', from: '2026-01-01', to: '2026-01-31', query: { symbol: 'AAPL' } });
        expect(r.data.prices.note).toMatch(/no data/);
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

describe('parseChatRequest screener', () => {
    const base = { brief: 'b', messages: [{ role: 'user', content: 'hi' }] };
    it('keeps a screener snapshot and drops a malformed one', () => {
        const ok = parseChatRequest({ ...base, screener: { index: 'topix', rows: [{ symbol: 'A' }, { symbol: '' }, null] } });
        expect(ok.ok && ok.request.screener?.rows).toEqual([{ symbol: 'A' }]);
        const bad = parseChatRequest({ ...base, screener: { rows: 'x' } });
        expect(bad.ok && bad.request.screener).toBeUndefined();
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

describe('page actions', () => {
    const actions = [
        { id: 'refresh_pinned', description: 'Refresh pinned stocks' },
        { id: 'refresh_prices', description: 'Refresh prices' },
    ];

    it('offers propose_action only when the page has actions, restricted to their ids', () => {
        expect(buildChatTools()).toBe(CHAT_TOOLS);
        const tools = buildChatTools(actions);
        const tool = tools.find(t => t.name === 'propose_action')!;
        expect((tool.input_schema.properties as Record<string, unknown>).id).toEqual({ type: 'string', enum: ['refresh_pinned', 'refresh_prices'] });
        expect(tool.description).toContain('does NOT run it');
        expect(tool.description).toContain('- refresh_pinned: Refresh pinned stocks');
    });

    it('turns a proposal into an action block for the browser and tells the model nothing ran', async () => {
        const r = await runChatTool('propose_action', { id: 'refresh_pinned', reason: 'Prices look old' }, { snapshot: null, actions });
        expect(r.isError).toBe(false);
        expect(r.emit).toBe('\n\n```action\n{"id":"refresh_pinned","reason":"Prices look old"}\n```\n\n');
        expect(r.text).toMatch(/only if they click/);
        expect(r.text).toMatch(/Do not say it has been done/);
    });

    it('refuses an action the page did not offer', async () => {
        const r = await runChatTool('propose_action', { id: 'delete_everything' }, { snapshot: null, actions });
        expect(r.isError).toBe(true);
        expect(r.emit).toBeUndefined();
        const none = await runChatTool('propose_action', { id: 'refresh_pinned' }, { snapshot: null });
        expect(none.isError).toBe(true);
    });

    it('clips the reason and strips control characters so the block stays one valid line', async () => {
        const r = await runChatTool('propose_action', { id: 'refresh_prices', reason: `a\n\`\`\`\n${'b'.repeat(500)}` }, { snapshot: null, actions });
        const json = r.emit!.split('\n')[3];
        expect(JSON.parse(json).reason.length).toBeLessThanOrEqual(200);
        expect(r.emit!.match(/```/g)).toHaveLength(3);
    });
});

describe('parseChatRequest actions', () => {
    const base = { brief: 'b', messages: [{ role: 'user', content: 'hi' }] };
    const parse = (actions: unknown) => {
        const r = parseChatRequest({ ...base, actions });
        return r.ok ? r.request.actions : 'rejected';
    };

    it('keeps valid actions and drops malformed, duplicate or empty ones', () => {
        expect(parse([
            { id: 'refresh_prices', description: 'Refresh' }, { id: 'refresh_prices', description: 'dup' },
            { id: 'Bad Id', description: 'x' }, { id: 'ok_one', description: '   ' }, null, 'x',
        ])).toEqual([{ id: 'refresh_prices', description: 'Refresh' }]);
    });

    it('caps the number of actions and clips descriptions', () => {
        const many = Array.from({ length: 20 }, (_, i) => ({ id: `a${i}`, description: 'd'.repeat(1000) }));
        const out = parse(many) as { id: string; description: string }[];
        expect(out).toHaveLength(8);
        expect(out[0].description).toHaveLength(300);
    });

    it('is absent when there is nothing valid', () => {
        expect(parse([])).toBeUndefined();
        expect(parse('nope')).toBeUndefined();
        expect(parse(undefined)).toBeUndefined();
    });
});
