/** @jest-environment node */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
    getSync, pushSync, deleteSync, purgeExpiredSync, resetSyncStoreForTests, SYNC_TTL_DAYS,
} from '../syncStore';

const TOKEN = 'a'.repeat(43);
const OTHER = 'b'.repeat(43);

describe('syncStore', () => {
    let dir: string;

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'sync-'));
        process.env.APP_DB_PATH = join(dir, 'sync.db');
        delete process.env.TURSO_DATABASE_URL;
        delete process.env.TURSO_AUTH_TOKEN;
        resetSyncStoreForTests();
    });

    afterEach(() => {
        delete process.env.APP_DB_PATH;
        resetSyncStoreForTests();
        rmSync(dir, { recursive: true, force: true });
    });

    it('creates then reads a blob', async () => {
        const res = await pushSync(TOKEN, '{"a":1}', 0);
        expect(res).toMatchObject({ ok: true, version: 1 });
        expect(await getSync(TOKEN)).toMatchObject({ blob: '{"a":1}', version: 1 });
    });

    it('returns null for an unknown token', async () => {
        expect(await getSync(OTHER)).toBeNull();
    });

    it('advances version on a matching base', async () => {
        const t0 = new Date('2026-01-01T00:00:00Z');
        await pushSync(TOKEN, 'v1', 0, t0);
        const res = await pushSync(TOKEN, 'v2', 1, new Date(t0.getTime() + 10_000));
        expect(res).toMatchObject({ ok: true, version: 2 });
        expect((await getSync(TOKEN, new Date(t0.getTime() + 11_000)))?.blob).toBe('v2');
    });

    it('rejects a stale base and returns the current row', async () => {
        const t0 = new Date('2026-01-01T00:00:00Z');
        await pushSync(TOKEN, 'v1', 0, t0);
        await pushSync(TOKEN, 'v2', 1, new Date(t0.getTime() + 10_000));
        const res = await pushSync(TOKEN, 'stale', 1, new Date(t0.getTime() + 20_000));
        expect(res).toMatchObject({ ok: false, conflict: { blob: 'v2', version: 2 } });
        expect((await getSync(TOKEN, new Date(t0.getTime() + 21_000)))?.blob).toBe('v2');
    });

    it('rejects create when a row already exists', async () => {
        await pushSync(TOKEN, 'v1', 0);
        const res = await pushSync(TOKEN, 'again', 0);
        expect(res).toMatchObject({ ok: false, conflict: { version: 1 } });
    });

    it('isolates tokens', async () => {
        await pushSync(TOKEN, 'mine', 0);
        await pushSync(OTHER, 'theirs', 0);
        expect((await getSync(TOKEN))?.blob).toBe('mine');
        expect((await getSync(OTHER))?.blob).toBe('theirs');
    });

    it('treats an expired row as absent', async () => {
        await pushSync(TOKEN, 'v1', 0);
        const later = new Date(Date.now() + (SYNC_TTL_DAYS + 1) * 86_400_000);
        expect(await getSync(TOKEN, later)).toBeNull();
    });

    it('refreshes expiry on push', async () => {
        const start = new Date('2026-01-01T00:00:00Z');
        await pushSync(TOKEN, 'v1', 0, start);
        const nearEnd = new Date(start.getTime() + (SYNC_TTL_DAYS - 1) * 86_400_000);
        await pushSync(TOKEN, 'v2', 1, nearEnd);
        const afterOriginalExpiry = new Date(start.getTime() + (SYNC_TTL_DAYS + 5) * 86_400_000);
        expect(await getSync(TOKEN, afterOriginalExpiry)).not.toBeNull();
    });

    it('deletes', async () => {
        await pushSync(TOKEN, 'v1', 0);
        expect(await deleteSync(TOKEN)).toBe(true);
        expect(await getSync(TOKEN)).toBeNull();
        expect(await deleteSync(TOKEN)).toBe(false);
    });

    it('purges expired rows', async () => {
        await pushSync(TOKEN, 'v1', 0, new Date('2020-01-01T00:00:00Z'));
        expect(await purgeExpiredSync()).toBe(1);
    });
});

describe('syncStore write throttle', () => {
    let dir: string;
    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'sync-'));
        process.env.APP_DB_PATH = join(dir, 'sync.db');
        delete process.env.TURSO_DATABASE_URL;
        delete process.env.TURSO_AUTH_TOKEN;
        resetSyncStoreForTests();
    });
    afterEach(() => {
        delete process.env.APP_DB_PATH;
        resetSyncStoreForTests();
        rmSync(dir, { recursive: true, force: true });
    });

    it('rejects a second write inside the minimum interval, then allows it', async () => {
        const t0 = new Date('2026-01-01T00:00:00Z');
        await pushSync(TOKEN, 'v1', 0, t0);
        const tooSoon = await pushSync(TOKEN, 'v2', 1, new Date(t0.getTime() + 1_000));
        expect(tooSoon).toMatchObject({ ok: false, throttled: true });
        expect((await getSync(TOKEN, t0))?.blob).toBe('v1');
        const later = await pushSync(TOKEN, 'v2', 1, new Date(t0.getTime() + 4_000));
        expect(later).toMatchObject({ ok: true, version: 2 });
    });

    it('still reports a stale base as a conflict, not a throttle', async () => {
        const t0 = new Date('2026-01-01T00:00:00Z');
        await pushSync(TOKEN, 'v1', 0, t0);
        await pushSync(TOKEN, 'v2', 1, new Date(t0.getTime() + 4_000));
        const stale = await pushSync(TOKEN, 'x', 1, new Date(t0.getTime() + 5_000));
        expect(stale).toMatchObject({ ok: false, conflict: { version: 2 } });
    });
});
