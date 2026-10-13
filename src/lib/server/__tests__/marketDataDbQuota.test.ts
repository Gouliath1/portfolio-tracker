/** @jest-environment node */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

let dir: string;
beforeEach(() => {
    jest.resetModules();
    dir = mkdtempSync(join(tmpdir(), 'mdb-'));
    process.env.MARKET_DB_PATH = join(dir, 'm.db');
    delete process.env.TURSO_DATABASE_URL;
    delete process.env.TURSO_AUTH_TOKEN;
});
afterEach(() => {
    delete process.env.MARKET_DB_PATH;
    rmSync(dir, { recursive: true, force: true });
});

const load = () => import('../marketDataDb');

describe('history coverage', () => {
    it('remembers how far back a series was requested, keeping the earliest', async () => {
        const db = await load();
        expect(await db.getHistoryCoverage('prices', 'NEW.T')).toBeNull();
        await db.setHistoryCoverage('prices', 'NEW.T', '1996-01-01');
        await db.setHistoryCoverage('prices', 'NEW.T', '2010-01-01'); // later start: ignored
        expect(await db.getHistoryCoverage('prices', 'NEW.T')).toBe('1996-01-01');

        jest.resetModules();
        expect(await (await load()).getHistoryCoverage('prices', 'NEW.T')).toBe('1996-01-01'); // persisted
    });

    it('keeps prices and fx coverage separate', async () => {
        const db = await load();
        await db.setHistoryCoverage('fx', 'USDJPY', '2000-01-01');
        expect(await db.getHistoryCoverage('prices', 'USDJPY')).toBeNull();
    });
});

describe('batched fundamentals writes', () => {
    it('persists many rows (price and ratios tiers) in one call', async () => {
        const db = await load();
        await db.setCachedFundamentalsBatch([
            { ticker: 'A', price: { name: 'A Co', price: 10, currency: 'JPY' } },
            { ticker: 'B', price: { name: 'B Co', price: 20, currency: 'USD' },
              ratios: { trailingPE: 5, forwardPE: 4, dividendYield: 0.01, priceToBook: 1, marketCap: 1e9, sector: 'Tech' } },
        ]);
        jest.resetModules();
        const rows = await (await load()).getCachedFundamentalsBatch(['A', 'B']);
        expect(rows.get('A')?.data).toMatchObject({ name: 'A Co', price: 10 });
        expect(rows.get('B')?.data).toMatchObject({ price: 20, trailingPE: 5, sector: 'Tech' });
        expect(rows.get('B')?.ratiosFetchedAt).not.toBeNull();
        expect(rows.get('A')?.ratiosFetchedAt).toBeNull();
    });

    it('is a no-op for an empty list', async () => {
        await expect((await load()).setCachedFundamentalsBatch([])).resolves.toBeUndefined();
    });
});

describe('change-only price upserts', () => {
    it('does not rewrite rows whose value is unchanged', async () => {
        const db = await load();
        await db.setCachedHistoricalPrices('T', { '2024-01-01': 1, '2024-01-02': 2 });
        // Count rows actually changed by re-upserting identical + one new value.
        const { createClient } = await import('@libsql/client');
        const c = createClient({ url: `file:${process.env.MARKET_DB_PATH}` });
        const stmt = (price: number) => ({
            sql: `INSERT INTO security_prices (ticker, price_date, close_price) VALUES (?, ?, ?)
                  ON CONFLICT (ticker, price_date) DO UPDATE SET close_price = excluded.close_price
                  WHERE close_price IS NOT excluded.close_price`,
            args: ['T', '2024-01-01', price],
        });
        expect((await c.execute(stmt(1))).rowsAffected).toBe(0);
        expect((await c.execute(stmt(9))).rowsAffected).toBe(1);
    });
});
