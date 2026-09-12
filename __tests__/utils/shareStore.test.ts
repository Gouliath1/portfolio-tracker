/**
 * @jest-environment node
 *
 * The share store is the only place this app holds someone's actual positions.
 * The tests below are therefore mostly about the security properties rather
 * than the happy path: that a raw token never reaches the database, that an
 * expired share is unreachable, and that revocation is immediate.
 */

import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { createClient } from '@libsql/client';

let dir: string;
let dbPath: string;

const SNAPSHOT = { portfolioName: 'Test', holdings: [{ ticker: 'AAPL' }] };
const TOKEN_A = 'a'.repeat(43);
const TOKEN_B = 'b'.repeat(43);

async function loadStore() {
    process.env.SHARE_DB_PATH = dbPath;
    delete process.env.TURSO_DATABASE_URL;
    delete process.env.TURSO_AUTH_TOKEN;
    delete process.env.VERCEL;
    const store = await import('../../src/lib/server/shareStore');
    store.resetShareStoreForTests();
    return store;
}

beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'share-store-'));
    dbPath = path.join(dir, 'shares.db');
    jest.resetModules();
});

afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    delete process.env.SHARE_DB_PATH;
});

describe('token validation', () => {
    it('accepts a 43-character base64url token', async () => {
        const { isValidToken } = await loadStore();
        expect(isValidToken(TOKEN_A)).toBe(true);
        expect(isValidToken('abc-DEF_123' + 'x'.repeat(32))).toBe(true);
    });

    it('rejects tokens short enough to be worth guessing', async () => {
        const { isValidToken } = await loadStore();
        expect(isValidToken('short')).toBe(false);
        expect(isValidToken('a'.repeat(31))).toBe(false);
        expect(isValidToken('')).toBe(false);
    });

    it('rejects non-strings and path-traversal shapes', async () => {
        const { isValidToken } = await loadStore();
        expect(isValidToken(null)).toBe(false);
        expect(isValidToken(123)).toBe(false);
        expect(isValidToken('../'.repeat(20))).toBe(false);
        expect(isValidToken('a'.repeat(40) + '/../etc/passwd')).toBe(false);
    });
});

describe('putShare / getShare', () => {
    it('round-trips a snapshot', async () => {
        const { putShare, getShare } = await loadStore();

        const result = await putShare(TOKEN_A, SNAPSHOT, '# brief');
        expect(result).not.toBeNull();

        const share = await getShare(TOKEN_A);
        expect(share?.snapshot).toEqual(SNAPSHOT);
        expect(share?.markdown).toBe('# brief');
    });

    it('never writes the raw token to the database', async () => {
        const { putShare } = await loadStore();
        await putShare(TOKEN_A, SNAPSHOT, '# brief');

        const client = createClient({ url: `file:${dbPath}` });
        const rows = await client.execute('SELECT * FROM portfolio_shares');
        const serialized = JSON.stringify(rows.rows);

        expect(serialized).not.toContain(TOKEN_A);
        // A SHA-256 hex digest is what should be there instead.
        expect(String(rows.rows[0].token_hash)).toMatch(/^[0-9a-f]{64}$/);
    });

    it('does not leak one share to a different token', async () => {
        const { putShare, getShare } = await loadStore();
        await putShare(TOKEN_A, SNAPSHOT, '# brief');

        expect(await getShare(TOKEN_B)).toBeNull();
    });

    it('overwrites in place rather than accumulating rows', async () => {
        const { putShare, getShare } = await loadStore();
        await putShare(TOKEN_A, SNAPSHOT, '# first');
        await putShare(TOKEN_A, { portfolioName: 'Updated' }, '# second');

        const share = await getShare(TOKEN_A);
        expect(share?.markdown).toBe('# second');

        const client = createClient({ url: `file:${dbPath}` });
        const rows = await client.execute('SELECT COUNT(*) AS n FROM portfolio_shares');
        expect(Number(rows.rows[0].n)).toBe(1);
    });

    it('preserves the creation time across updates', async () => {
        const { putShare, getShare } = await loadStore();
        const created = new Date('2026-01-01T00:00:00Z');
        await putShare(TOKEN_A, SNAPSHOT, '# first', created);
        await putShare(TOKEN_A, SNAPSHOT, '# second', new Date('2026-01-10T00:00:00Z'));

        const share = await getShare(TOKEN_A, new Date('2026-01-11T00:00:00Z'));
        expect(share?.createdAt).toBe(created.toISOString());
        expect(share?.updatedAt).toBe('2026-01-10T00:00:00.000Z');
    });
});

describe('expiry', () => {
    it('sets the expiry 30 days out', async () => {
        const { putShare, SHARE_TTL_DAYS } = await loadStore();
        const now = new Date('2026-01-01T00:00:00Z');

        const result = await putShare(TOKEN_A, SNAPSHOT, '# brief', now);
        const expected = new Date(now.getTime() + SHARE_TTL_DAYS * 86_400_000);
        expect(result?.expiresAt).toBe(expected.toISOString());
    });

    it('treats an expired share as absent', async () => {
        const { putShare, getShare } = await loadStore();
        await putShare(TOKEN_A, SNAPSHOT, '# brief', new Date('2026-01-01T00:00:00Z'));

        // 31 days later.
        expect(await getShare(TOKEN_A, new Date('2026-02-01T00:00:00Z'))).toBeNull();
    });

    it('deletes an expired share on the way past', async () => {
        const { putShare, getShare } = await loadStore();
        await putShare(TOKEN_A, SNAPSHOT, '# brief', new Date('2026-01-01T00:00:00Z'));
        await getShare(TOKEN_A, new Date('2026-02-01T00:00:00Z'));

        const client = createClient({ url: `file:${dbPath}` });
        const rows = await client.execute('SELECT COUNT(*) AS n FROM portfolio_shares');
        expect(Number(rows.rows[0].n)).toBe(0);
    });

    it('pushes the expiry out on every publish, so an active share never lapses', async () => {
        const { putShare, getShare } = await loadStore();
        await putShare(TOKEN_A, SNAPSHOT, '# brief', new Date('2026-01-01T00:00:00Z'));
        // Republished on day 20 — the original expiry would have been day 30.
        await putShare(TOKEN_A, SNAPSHOT, '# brief', new Date('2026-01-21T00:00:00Z'));

        // Day 45: past the first expiry, inside the refreshed one.
        expect(await getShare(TOKEN_A, new Date('2026-02-15T00:00:00Z'))).not.toBeNull();
    });

    it('purges everything already expired', async () => {
        const { putShare, purgeExpired, getShare } = await loadStore();
        await putShare(TOKEN_A, SNAPSHOT, '# old', new Date('2026-01-01T00:00:00Z'));
        await putShare(TOKEN_B, SNAPSHOT, '# new', new Date('2026-03-01T00:00:00Z'));

        const removed = await purgeExpired(new Date('2026-03-02T00:00:00Z'));
        expect(removed).toBe(1);
        expect(await getShare(TOKEN_B, new Date('2026-03-02T00:00:00Z'))).not.toBeNull();
    });
});

describe('revocation', () => {
    it('makes the share unreachable immediately', async () => {
        const { putShare, deleteShare, getShare } = await loadStore();
        await putShare(TOKEN_A, SNAPSHOT, '# brief');

        expect(await deleteShare(TOKEN_A)).toBe(true);
        expect(await getShare(TOKEN_A)).toBeNull();
    });

    it('reports false for a token that was never stored', async () => {
        const { deleteShare } = await loadStore();
        expect(await deleteShare(TOKEN_B)).toBe(false);
    });
});

describe('hashing helpers', () => {
    it('is deterministic and collision-free across tokens', async () => {
        const { hashToken } = await loadStore();
        expect(hashToken(TOKEN_A)).toBe(hashToken(TOKEN_A));
        expect(hashToken(TOKEN_A)).not.toBe(hashToken(TOKEN_B));
        expect(hashToken(TOKEN_A)).toMatch(/^[0-9a-f]{64}$/);
    });

    it('compares equal-length digests without throwing on a mismatch', async () => {
        const { hashToken, hashesMatch } = await loadStore();
        expect(hashesMatch(hashToken(TOKEN_A), hashToken(TOKEN_A))).toBe(true);
        expect(hashesMatch(hashToken(TOKEN_A), hashToken(TOKEN_B))).toBe(false);
        expect(hashesMatch('abcd', 'ab')).toBe(false);
    });
});
