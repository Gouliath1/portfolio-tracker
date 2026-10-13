/** @jest-environment node */
const fetchChartMeta = jest.fn();
const fetchQuoteSummary = jest.fn();
jest.mock('@portfolio/core', () => ({ fetchChartMeta: (...a: unknown[]) => fetchChartMeta(...a) }));
jest.mock('../jquantsApi', () => ({ fetchJQuantsRatios: jest.fn() }));
jest.mock('../yahooAuth', () => ({
    fetchQuoteSummary: (...a: unknown[]) => fetchQuoteSummary(...a),
    fetchYahooSector: jest.fn().mockResolvedValue(null),
}));

const rows = new Map<string, unknown>();
const writes: unknown[][] = [];
jest.mock('../marketDataDb', () => ({
    getCachedFundamentalsBatch: jest.fn(async (symbols: string[]) => {
        const m = new Map();
        for (const s of symbols) if (rows.has(s)) m.set(s, rows.get(s));
        return m;
    }),
    setCachedFundamentalsBatch: jest.fn(async (items: unknown[]) => { writes.push(items); }),
}));

import { POST } from '../../../app/api/screener/refresh/route';
import { resetGuardsForTests } from '../requestGuards';

const post = (body: unknown, ip = '4.4.4.4') => POST(new Request('http://x/api/screener/refresh', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
}));

const fresh = () => ({
    data: { symbol: 'S', name: 'S', price: 9, currency: 'JPY', trailingPE: 1, forwardPE: 1, dividendYield: 0, priceToBook: 1, marketCap: 1, sector: 'T' },
    fetchedAt: new Date().toISOString(), ratiosFetchedAt: new Date().toISOString(),
});

beforeEach(() => {
    fetchChartMeta.mockReset();
    fetchQuoteSummary.mockReset();
    fetchChartMeta.mockResolvedValue({ price: 5, currency: 'JPY', name: 'N' });
    fetchQuoteSummary.mockResolvedValue({ trailingPE: 1, forwardPE: 1, dividendYield: 0, priceToBook: 1, marketCap: 1, sector: 'T' });
    rows.clear();
    writes.length = 0;
    resetGuardsForTests();
    delete process.env.API_EXPENSIVE_DISABLED;
});

it('validates input', async () => {
    expect((await post('not json')).status).toBe(400);
    expect((await post({ symbols: [] })).status).toBe(400);
    expect((await post({ symbols: ['a/b'] })).status).toBe(400);
    expect((await post({ symbols: Array.from({ length: 51 }, (_, i) => `S${i}`) })).status).toBe(400);
});

it('refreshes only what is stale; everything fresh is answered from the shared cache', async () => {
    rows.set('FRESH1', fresh());
    rows.set('FRESH2', fresh());
    const res = await post({ symbols: ['FRESH1', 'FRESH2', 'NEW1'] });
    const body = await res.json();
    expect(body.cached).toBe(2);
    expect(body.refreshed).toBe(1);
    expect(Object.keys(body.results)).toEqual(expect.arrayContaining(['FRESH1', 'FRESH2', 'NEW1']));
    expect(fetchChartMeta).toHaveBeenCalledTimes(1);
});

it('persists all refreshed rows in ONE batched write', async () => {
    await post({ symbols: Array.from({ length: 30 }, (_, i) => `N${i}`) });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toHaveLength(30);
});

it('a second user refreshing the same symbols right after costs no upstream calls', async () => {
    const first = await (await post({ symbols: ['SAME'] }, '5.5.5.5')).json();
    expect(first.refreshed).toBe(1);
    rows.set('SAME', fresh()); // what the first user's write put in the shared DB
    fetchChartMeta.mockClear();
    const second = await (await post({ symbols: ['SAME'] }, '6.6.6.6')).json();
    expect(second.cached).toBe(1);
    expect(fetchChartMeta).not.toHaveBeenCalled();
});

it('force is honoured once per cooldown across users', async () => {
    rows.set('F', fresh());
    await post({ symbols: ['F'], force: true }, '7.7.7.7');
    await post({ symbols: ['F'], force: true }, '8.8.8.8');
    expect(fetchChartMeta).toHaveBeenCalledTimes(1);
});

it('kill switch serves cache only', async () => {
    process.env.API_EXPENSIVE_DISABLED = '1';
    rows.set('C', { ...fresh(), fetchedAt: '2020-01-01T00:00:00Z' });
    const body = await (await post({ symbols: ['C', 'MISSING'] })).json();
    expect(body.disabled).toBe(true);
    expect(body.cached).toBe(1);
    expect(body.failed).toBe(1);
    expect(fetchChartMeta).not.toHaveBeenCalled();
});

it('tier=price skips the ratios call', async () => {
    await post({ symbols: ['P1'], tier: 'price' });
    expect(fetchQuoteSummary).not.toHaveBeenCalled();
});

it('stream mode sends one NDJSON line per row, then a summary line', async () => {
    rows.set('CACHED', fresh());
    const res = await post({ symbols: ['CACHED', 'NEW'], stream: true });
    expect(res.headers.get('content-type')).toContain('ndjson');
    const lines = (await res.text()).trim().split('\n').map(l => JSON.parse(l));
    const rowsSeen = lines.filter(l => l.symbol).map(l => l.symbol).sort();
    expect(rowsSeen).toEqual(['CACHED', 'NEW']);
    expect(lines[lines.length - 1]).toMatchObject({ done: true, refreshed: 1, cached: 1, failed: 0 });
    expect(writes.flat()).toHaveLength(1); // only the refreshed row is persisted
});
