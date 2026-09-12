/**
 * @jest-environment node
 */

/**
 * Schema migration on an existing market cache.
 *
 * The columns added after the first release have to land on databases that
 * predate them, and the step that adds them must not be able to take the whole
 * cache down: when it threw in production, every request fell through to the
 * upstream API with no cache at all. These tests pin both halves — the columns
 * appear, and a database that already has them still initialises cleanly.
 */

import { mkdtempSync, rmSync } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { createClient } from '@libsql/client';

/** The fundamentals table as it shipped before `sector` and `ratios_fetched_at`. */
const LEGACY_FUNDAMENTALS = `
    CREATE TABLE security_fundamentals (
        ticker TEXT PRIMARY KEY,
        name TEXT,
        price REAL,
        currency TEXT,
        trailing_pe REAL,
        forward_pe REAL,
        dividend_yield REAL,
        price_to_book REAL,
        market_cap REAL,
        fetched_at TEXT NOT NULL
    )
`;

describe('marketDataDb schema migration', () => {
    let dir: string;
    let dbPath: string;
    let originalPath: string | undefined;

    beforeEach(() => {
        dir = mkdtempSync(path.join(tmpdir(), 'market-cache-'));
        dbPath = path.join(dir, 'marketCache.db');
        originalPath = process.env.MARKET_DB_PATH;
        process.env.MARKET_DB_PATH = dbPath;
        // The module holds its client and its "storage is broken" flag at module
        // scope, so each test needs a fresh copy.
        jest.resetModules();
    });

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
        if (originalPath === undefined) delete process.env.MARKET_DB_PATH;
        else process.env.MARKET_DB_PATH = originalPath;
    });

    it('adds the newer columns to a pre-migration database', async () => {
        const seed = createClient({ url: `file:${dbPath}` });
        await seed.execute(LEGACY_FUNDAMENTALS);
        await seed.execute(
            `INSERT INTO security_fundamentals (ticker, fetched_at) VALUES ('7203.T', '2026-01-01')`,
        );

        const { getCacheStatus } = await import('../marketDataDb');
        const status = await getCacheStatus();

        expect(status.kind).toBe('sqlite');
        expect(status.reason).toBeNull();

        const migrated = await seed.execute(
            'SELECT sector, ratios_fetched_at FROM security_fundamentals',
        );
        expect(migrated.rows).toHaveLength(1);
    });

    it('initialises cleanly when the columns already exist', async () => {
        // First run creates and migrates the schema.
        const first = await import('../marketDataDb');
        expect((await first.getCacheStatus()).kind).toBe('sqlite');

        // Second run meets an already-migrated database: adding the columns
        // again must be a no-op, not a failure that disables the cache.
        jest.resetModules();
        const second = await import('../marketDataDb');
        const status = await second.getCacheStatus();

        expect(status.kind).toBe('sqlite');
        expect(status.reason).toBeNull();
        expect(status.rows).toBe(0);
    });

    it('reports the cause when storage cannot be used at all', async () => {
        process.env.MARKET_DB_PATH = path.join(dir, 'missing-dir', 'nested', 'cache.db');
        rmSync(dir, { recursive: true, force: true }); // the parent is gone, so the file cannot be created

        const { getCacheStatus } = await import('../marketDataDb');
        const status = await getCacheStatus();

        if (status.kind === 'unavailable') {
            expect(status.reason).toEqual(expect.any(String));
        } else {
            // Some platforms happily create the tree; then it must be usable.
            expect(status.reason).toBeNull();
        }
    });
});
