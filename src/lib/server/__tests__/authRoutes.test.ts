/** @jest-environment node */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { NextRequest } from 'next/server';
import { resetAppDbForTests } from '../appDb';
import { resetGuardsForTests } from '../requestGuards';
import { POST as requestLink } from '../../../app/api/auth/request/route';
import { POST as verify } from '../../../app/api/auth/verify/route';
import { GET as me } from '../../../app/api/auth/me/route';
import { POST as logout } from '../../../app/api/auth/logout/route';
import { DELETE as deleteAccountRoute } from '../../../app/api/auth/account/route';
import * as sync from '../../../app/api/sync/route';

const ORIGIN = 'http://localhost:3000';
const base = { origin: ORIGIN, host: 'localhost:3000' };

const req = (path: string, method: string, body?: unknown, headers: Record<string, string> = {}) =>
    new NextRequest(`${ORIGIN}${path}`, {
        method,
        headers: { 'content-type': 'application/json', ...base, ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
    });

/** Request a link and return the raw token from the dev link. */
async function requestToken(email: string, ip = '1.1.1.1'): Promise<string> {
    const res = await requestLink(req('/api/auth/request', 'POST', { email }, { 'x-forwarded-for': ip }));
    const body = await res.json();
    expect(body.ok).toBe(true);
    return new URL(body.devLink).hash.replace('#t=', '');
}

async function signIn(email = 'a@x.com'): Promise<string> {
    const token = await requestToken(email);
    const res = await verify(req('/api/auth/verify', 'POST', { token }));
    expect(res.status).toBe(200);
    return res.headers.get('set-cookie')!.split(';')[0];
}

let dir: string;
beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'authr-'));
    process.env.APP_DB_PATH = join(dir, 'app.db');
    delete process.env.TURSO_DATABASE_URL;
    delete process.env.TURSO_AUTH_TOKEN;
    delete process.env.RESEND_API_KEY;
    delete process.env.APP_URL;
    resetAppDbForTests();
    resetGuardsForTests();
    jest.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.APP_DB_PATH;
    resetAppDbForTests();
    rmSync(dir, { recursive: true, force: true });
});

describe('POST /api/auth/request', () => {
    it('refuses requests that are not same-origin', async () => {
        const noOrigin = new NextRequest(`${ORIGIN}/api/auth/request`, {
            method: 'POST', headers: { host: 'localhost:3000', 'content-type': 'application/json' },
            body: JSON.stringify({ email: 'a@x.com' }),
        });
        expect((await requestLink(noOrigin)).status).toBe(403);
        const foreign = req('/api/auth/request', 'POST', { email: 'a@x.com' }, { origin: 'https://evil.example' });
        expect((await requestLink(foreign)).status).toBe(403);
    });

    it('rejects an invalid address', async () => {
        expect((await requestLink(req('/api/auth/request', 'POST', { email: 'nope' }))).status).toBe(400);
    });

    it('mints a link whose token is in the fragment, not the query string', async () => {
        const body = await (await requestLink(req('/api/auth/request', 'POST', { email: 'a@x.com' }))).json();
        const url = new URL(body.devLink);
        expect(url.pathname).toBe('/auth/verify');
        expect(url.search).toBe('');
        expect(url.hash).toMatch(/^#t=[A-Za-z0-9_-]{43}$/);
    });

    it('stays silent (same ok response) once an address is over its hourly cap', async () => {
        for (let i = 0; i < 3; i++) await requestToken('cap@x.com', `9.9.9.${i}`);
        const res = await requestLink(req('/api/auth/request', 'POST', { email: 'cap@x.com' }, { 'x-forwarded-for': '9.9.9.9' }));
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body).toEqual({ ok: true }); // no devLink: nothing was created or sent
    });

    it('refuses to build links from the Host header in production', async () => {
        const env = process.env as Record<string, string | undefined>;
        const prev = env.NODE_ENV;
        env.NODE_ENV = 'production';
        try {
            const res = await requestLink(req('/api/auth/request', 'POST', { email: 'a@x.com' }));
            expect(res.status).toBe(503);
        } finally { env.NODE_ENV = prev; }
    });
});

describe('sign in / session', () => {
    it('verifies a link, sets an HttpOnly cookie, and /me reports the user', async () => {
        const token = await requestToken('me@x.com');
        const res = await verify(req('/api/auth/verify', 'POST', { token }));
        const cookie = res.headers.get('set-cookie')!;
        expect(cookie).toContain('HttpOnly');
        expect(cookie).toContain('SameSite=Lax');

        const who = await (await me(req('/api/auth/me', 'GET', undefined, { cookie: cookie.split(';')[0] }))).json();
        expect(who).toEqual({ user: { email: 'me@x.com' } });
    });

    it('a link works once', async () => {
        const token = await requestToken('once@x.com');
        expect((await verify(req('/api/auth/verify', 'POST', { token }))).status).toBe(200);
        expect((await verify(req('/api/auth/verify', 'POST', { token }))).status).toBe(400);
    });

    it('/me is null without a valid cookie', async () => {
        expect(await (await me(req('/api/auth/me', 'GET'))).json()).toEqual({ user: null });
        const forged = await me(req('/api/auth/me', 'GET', undefined, { cookie: `pt_session=${'x'.repeat(43)}` }));
        expect(await forged.json()).toEqual({ user: null });
    });

    it('logout revokes the session server-side', async () => {
        const cookie = await signIn();
        const out = await logout(req('/api/auth/logout', 'POST', {}, { cookie }));
        expect(out.headers.get('set-cookie')).toContain('Max-Age=0');
        // The old cookie value is dead even if someone kept a copy.
        expect(await (await me(req('/api/auth/me', 'GET', undefined, { cookie }))).json()).toEqual({ user: null });
    });

    it('deletes the account and its synced portfolio', async () => {
        const cookie = await signIn('del@x.com');
        await sync.POST(req('/api/sync', 'POST', { blob: 'mine', baseVersion: 0 }, { cookie }));

        expect((await deleteAccountRoute(req('/api/auth/account', 'DELETE', undefined, { cookie }))).status).toBe(200);
        expect(await (await me(req('/api/auth/me', 'GET', undefined, { cookie }))).json()).toEqual({ user: null });
        expect((await sync.PUT(req('/api/sync', 'PUT', {}, { cookie }))).status).toBe(401);
    });

    it('requires being signed in and same-origin to delete an account', async () => {
        expect((await deleteAccountRoute(req('/api/auth/account', 'DELETE'))).status).toBe(401);
        const cookie = await signIn('x@x.com');
        expect((await deleteAccountRoute(req('/api/auth/account', 'DELETE', undefined, { cookie, origin: 'https://evil.example' }))).status).toBe(403);
    });
});

describe('sync as an account', () => {
    it('pushes and pulls without any key', async () => {
        const cookie = await signIn('sync@x.com');
        const push = await sync.POST(req('/api/sync', 'POST', { blob: 'v1', baseVersion: 0 }, { cookie }));
        expect(push.status).toBe(200);
        const pulled = await (await sync.PUT(req('/api/sync', 'PUT', {}, { cookie }))).json();
        expect(pulled).toMatchObject({ found: true, blob: 'v1', version: 1 });
    });

    it('is the same data from any device signed in as that account', async () => {
        const first = await signIn('multi@x.com');
        await sync.POST(req('/api/sync', 'POST', { blob: 'shared', baseVersion: 0 }, { cookie: first }));
        const second = await signIn('multi@x.com'); // another device, new session, same account
        expect(second).not.toBe(first);
        expect(await (await sync.PUT(req('/api/sync', 'PUT', {}, { cookie: second }))).json())
            .toMatchObject({ found: true, blob: 'shared' });
    });

    it('keeps accounts apart', async () => {
        const a = await signIn('a1@x.com');
        const b = await signIn('b1@x.com');
        await sync.POST(req('/api/sync', 'POST', { blob: 'a-only', baseVersion: 0 }, { cookie: a }));
        expect(await (await sync.PUT(req('/api/sync', 'PUT', {}, { cookie: b }))).json()).toMatchObject({ found: false });
    });

    it('rejects an anonymous request with no key, and a cross-origin cookie write', async () => {
        expect((await sync.PUT(req('/api/sync', 'PUT', {}))).status).toBe(401);
        const cookie = await signIn('csrf@x.com');
        const cross = req('/api/sync', 'POST', { blob: 'x', baseVersion: 0 }, { cookie, origin: 'https://evil.example' });
        expect((await sync.POST(cross)).status).toBe(403);
    });

    it('anonymous key sync is unchanged and independent of the account', async () => {
        const key = 'k'.repeat(43);
        const cookie = await signIn('both@x.com');
        await sync.POST(req('/api/sync', 'POST', { token: key, blob: 'anon', baseVersion: 0 }, { cookie }));
        expect(await (await sync.PUT(req('/api/sync', 'PUT', { token: key }))).json()).toMatchObject({ blob: 'anon' });
        expect(await (await sync.PUT(req('/api/sync', 'PUT', {}, { cookie }))).json()).toMatchObject({ found: false });
        expect((await sync.PUT(req('/api/sync', 'PUT', { token: 'short' }))).status).toBe(400);
    });
});
