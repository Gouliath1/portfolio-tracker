/** @jest-environment node */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { resetAppDbForTests } from '../appDb';
import {
    normalizeEmail, checkLoginRequestAllowed, createLoginToken, consumeLoginToken,
    createSession, getSessionUser, deleteSession, deleteAccount,
    LOGIN_TOKEN_TTL_MS, SESSION_TTL_MS, MAX_LOGIN_EMAILS_PER_ADDRESS_PER_HOUR,
} from '../authStore';
import { pushSync, getSync } from '../syncStore';

let dir: string;
beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'auth-'));
    process.env.APP_DB_PATH = join(dir, 'app.db');
    delete process.env.TURSO_DATABASE_URL;
    delete process.env.TURSO_AUTH_TOKEN;
    resetAppDbForTests();
});
afterEach(() => {
    delete process.env.APP_DB_PATH;
    resetAppDbForTests();
    rmSync(dir, { recursive: true, force: true });
});

const T0 = new Date('2026-10-13T12:00:00Z');
const at = (ms: number) => new Date(T0.getTime() + ms);

describe('normalizeEmail', () => {
    it('lowercases and trims', () => expect(normalizeEmail('  Me@Example.COM ')).toBe('me@example.com'));
    it.each(['', 'nope', 'a@b', 'a b@c.de', 42, null, `${'a'.repeat(250)}@x.com`])('rejects %j', v => {
        expect(normalizeEmail(v)).toBeNull();
    });
});

describe('login tokens', () => {
    it('signs a user in once, and creates the account on first use', async () => {
        const token = (await createLoginToken('a@x.com', T0))!;
        const user = await consumeLoginToken(token, at(1000));
        expect(user).toMatchObject({ email: 'a@x.com' });
        expect(user!.id).toMatch(/[0-9a-f-]{36}/);
    });

    it('is single-use', async () => {
        const token = (await createLoginToken('a@x.com', T0))!;
        expect(await consumeLoginToken(token, at(1000))).not.toBeNull();
        expect(await consumeLoginToken(token, at(2000))).toBeNull();
    });

    it('expires', async () => {
        const token = (await createLoginToken('a@x.com', T0))!;
        expect(await consumeLoginToken(token, at(LOGIN_TOKEN_TTL_MS + 1))).toBeNull();
    });

    it('two simultaneous redemptions cannot both succeed', async () => {
        const token = (await createLoginToken('a@x.com', T0))!;
        const results = await Promise.all([consumeLoginToken(token, at(1)), consumeLoginToken(token, at(1))]);
        expect(results.filter(Boolean)).toHaveLength(1);
    });

    it('rejects malformed and unknown tokens', async () => {
        expect(await consumeLoginToken('short', T0)).toBeNull();
        expect(await consumeLoginToken('x'.repeat(43), T0)).toBeNull();
        expect(await consumeLoginToken(undefined, T0)).toBeNull();
    });

    it('returns the same account for the same email on later sign-ins', async () => {
        const a = await consumeLoginToken((await createLoginToken('a@x.com', T0))!, at(1));
        const b = await consumeLoginToken((await createLoginToken('a@x.com', at(10)))!, at(20));
        expect(b!.id).toBe(a!.id);
    });
});

describe('request limits', () => {
    it('caps sign-in emails per address per hour', async () => {
        for (let i = 0; i < MAX_LOGIN_EMAILS_PER_ADDRESS_PER_HOUR; i++) await createLoginToken('a@x.com', at(i));
        expect(await checkLoginRequestAllowed('a@x.com', at(1000))).toEqual({ ok: false, reason: 'address' });
        expect(await checkLoginRequestAllowed('other@x.com', at(1000))).toEqual({ ok: true });
        expect(await checkLoginRequestAllowed('a@x.com', at(3_600_000 + 10))).toEqual({ ok: true });
    });

    it('caps total emails per day', async () => {
        await createLoginToken('a@x.com', at(0));
        await createLoginToken('b@x.com', at(1));
        expect(await checkLoginRequestAllowed('c@x.com', at(2), 2)).toEqual({ ok: false, reason: 'global' });
        expect(await checkLoginRequestAllowed('c@x.com', at(2), 3)).toEqual({ ok: true });
    });
});

describe('sessions', () => {
    const signIn = async () => {
        const user = (await consumeLoginToken((await createLoginToken('a@x.com', T0))!, at(1)))!;
        const session = (await createSession(user.id, at(2)))!;
        return { user, session };
    };

    it('resolves a session to its user', async () => {
        const { user, session } = await signIn();
        expect(await getSessionUser(session, at(1000))).toEqual(user);
    });

    it('rejects unknown/malformed session ids', async () => {
        expect(await getSessionUser('x'.repeat(43), T0)).toBeNull();
        expect(await getSessionUser('bad', T0)).toBeNull();
    });

    it('expires, and slides forward when used', async () => {
        const { session } = await signIn();
        expect(await getSessionUser(session, at(SESSION_TTL_MS + 5))).toBeNull();

        const second = await signIn();
        const day2 = 25 * 3_600_000;
        expect(await getSessionUser(second.session, at(day2))).not.toBeNull(); // touches expiry
        expect(await getSessionUser(second.session, at(day2 + SESSION_TTL_MS - 1000))).not.toBeNull();
    });

    it('can be revoked', async () => {
        const { session } = await signIn();
        await deleteSession(session);
        expect(await getSessionUser(session, at(10))).toBeNull();
    });
});

describe('deleteAccount', () => {
    it('removes the account, its sessions and its synced portfolio', async () => {
        const user = (await consumeLoginToken((await createLoginToken('a@x.com', T0))!, at(1)))!;
        const session = (await createSession(user.id, at(2)))!;
        await pushSync({ accountId: user.id }, 'blob', 0, at(3));
        expect((await getSync({ accountId: user.id }, at(4)))?.blob).toBe('blob');

        expect(await deleteAccount(user.id)).toBe(true);
        expect(await getSessionUser(session, at(5))).toBeNull();
        expect(await getSync({ accountId: user.id }, at(5))).toBeNull();
    });

    it('leaves other accounts and anonymous sync rows alone', async () => {
        const a = (await consumeLoginToken((await createLoginToken('a@x.com', T0))!, at(1)))!;
        const b = (await consumeLoginToken((await createLoginToken('b@x.com', at(2)))!, at(3)))!;
        await pushSync({ accountId: b.id }, 'b-blob', 0, at(4));
        await pushSync('k'.repeat(43), 'anon-blob', 0, at(4));
        await deleteAccount(a.id);
        expect((await getSync({ accountId: b.id }, at(5)))?.blob).toBe('b-blob');
        expect((await getSync('k'.repeat(43), at(5)))?.blob).toBe('anon-blob');
    });
});
