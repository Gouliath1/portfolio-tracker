/** @jest-environment node */
const fetchChartMeta = jest.fn();
jest.mock('@portfolio/core', () => ({ fetchChartMeta: (...a: unknown[]) => fetchChartMeta(...a) }));

const dbRows = new Map<string, { data: Record<string, unknown>; fetchedAt: string; ratiosFetchedAt: string | null }>();
const batchWrites: unknown[][] = [];
jest.mock('../marketDataDb', () => ({
    getCachedFundamentalsBatch: jest.fn(async (symbols: string[]) => {
        const m = new Map();
        for (const s of symbols) if (dbRows.has(s)) m.set(s, dbRows.get(s));
        return m;
    }),
    setCachedFundamentalsBatch: jest.fn(async (items: unknown[]) => { batchWrites.push(items); }),
}));

import * as route from '../../../app/api/prices/route';
import { resetGuardsForTests } from '../requestGuards';

const get = (qs: string, ip = '1.1.1.1') =>
    route.GET(new Request(`http://x/api/prices?${qs}`, { headers: { 'x-forwarded-for': ip } }));

beforeEach(() => {
    fetchChartMeta.mockReset();
    dbRows.clear();
    batchWrites.length = 0;
    resetGuardsForTests();
    jest.resetModules();
    delete process.env.API_EXPENSIVE_DISABLED;
});

it('has no POST handler (clients must not be able to write prices into the shared cache)', () => {
    expect((route as Record<string, unknown>).POST).toBeUndefined();
});

it('rejects malformed single symbols', async () => {
    expect((await get('symbol=a/b')).status).toBe(400);
    expect((await get('symbol=x?y=1')).status).toBe(400);
});

it('batch: invalid symbols come back null and are never fetched; valid ones are', async () => {
    fetchChartMeta.mockResolvedValue({ price: 50, currency: 'USD', name: 'Co' });
    const res = await get('symbols=AAPL,bad%2Fsym');
    const body = await res.json();
    expect(body.prices.AAPL).toMatchObject({ price: 50 });
    expect(body.prices['bad/sym']).toBeNull();
    expect(fetchChartMeta).toHaveBeenCalledTimes(1);
});

it('batch: more than 100 symbols is rejected', async () => {
    const many = Array.from({ length: 101 }, (_, i) => `S${i}`).join(',');
    expect((await get(`symbols=${many}`)).status).toBe(400);
});

it('serves a same-day DB row to everyone without calling Yahoo, and is CDN-cacheable', async () => {
    dbRows.set('7203.T', { data: { price: 3000 }, fetchedAt: new Date().toISOString(), ratiosFetchedAt: null });
    const res = await get('symbols=7203.T');
    expect((await res.json()).prices['7203.T']).toMatchObject({ price: 3000 });
    expect(fetchChartMeta).not.toHaveBeenCalled();
    expect(res.headers.get('cache-control')).toContain('s-maxage=');
    expect(batchWrites).toHaveLength(1);
    expect(batchWrites[0]).toHaveLength(0); // nothing to write on a cache hit
});

it('writes everything it fetched in a single batch', async () => {
    fetchChartMeta.mockImplementation(async (s: string) => ({ price: s.length, currency: 'USD', name: s }));
    await get('symbols=AA,BBB,CCCC');
    expect(batchWrites).toHaveLength(1);
    expect(batchWrites[0]).toHaveLength(3);
});

it('fresh=1 is honoured once per cooldown; the second forced request reads the cache', async () => {
    fetchChartMeta.mockResolvedValue({ price: 7, currency: 'USD', name: 'F' });
    await get('symbols=FORCE&fresh=1', '2.2.2.2');
    await get('symbols=FORCE&fresh=1', '3.3.3.3'); // different user, same symbol
    expect(fetchChartMeta).toHaveBeenCalledTimes(1);
});

it('kill switch: nothing reaches upstream, cached/stale data is still served', async () => {
    process.env.API_EXPENSIVE_DISABLED = '1';
    fetchChartMeta.mockResolvedValue({ price: 7, currency: 'USD', name: 'F' });
    dbRows.set('KS', { data: { price: 1 }, fetchedAt: new Date().toISOString(), ratiosFetchedAt: null });
    dbRows.set('OLD', { data: { price: 4 }, fetchedAt: '2020-01-01T00:00:00Z', ratiosFetchedAt: null });
    const body = await (await get('symbols=KS,OLD,NEW&fresh=1')).json();
    expect(body.prices.KS).toMatchObject({ price: 1 });
    expect(body.prices.OLD).toMatchObject({ price: 4, stale: true });
    expect(body.prices.NEW).toBeNull();
    expect(fetchChartMeta).not.toHaveBeenCalled();
});

it('rate-limits a single client', async () => {
    fetchChartMeta.mockResolvedValue({ price: 1, currency: 'USD', name: 'n' });
    let status = 200;
    for (let i = 0; i < 125; i++) status = (await get('symbol=RL', '9.9.9.9')).status;
    expect(status).toBe(429);
});
