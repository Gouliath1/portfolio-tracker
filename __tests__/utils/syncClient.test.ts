import { planSync, generateSyncToken, buildJoinLink, readJoinTokenFromHash } from '../../src/utils/syncClient';

const dev = { version: 3, lastBlob: 'A' };

describe('planSync', () => {
    it('noop when everything matches', () => {
        expect(planSync({ localBlob: 'A', device: dev, server: { version: 3, blob: 'A' } })).toBe('noop');
    });
    it('push when only local changed', () => {
        expect(planSync({ localBlob: 'B', device: dev, server: { version: 3, blob: 'A' } })).toBe('push');
    });
    it('pull when only server changed', () => {
        expect(planSync({ localBlob: 'A', device: dev, server: { version: 4, blob: 'C' } })).toBe('pull');
    });
    it('conflict when both changed', () => {
        expect(planSync({ localBlob: 'B', device: dev, server: { version: 4, blob: 'C' } })).toBe('conflict');
    });
    it('adopt when server moved but holds identical content', () => {
        expect(planSync({ localBlob: 'B', device: dev, server: { version: 4, blob: 'B' } })).toBe('adopt');
    });
    it('ended when the server row is gone (never recreated)', () => {
        expect(planSync({ localBlob: 'A', device: dev, server: null })).toBe('ended');
    });
});

describe('token + link', () => {
    it('generates 43-char base64url tokens', () => {
        const t = generateSyncToken();
        expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(generateSyncToken()).not.toBe(t);
    });
    it('round-trips through the fragment', () => {
        const t = generateSyncToken();
        const link = buildJoinLink(t, 'https://x.test');
        expect(link.startsWith('https://x.test/#sync=')).toBe(true);
        expect(readJoinTokenFromHash(new URL(link).hash)).toBe(t);
    });
    it('ignores unrelated or short fragments', () => {
        expect(readJoinTokenFromHash('#foo=bar')).toBeNull();
        expect(readJoinTokenFromHash('#sync=short')).toBeNull();
    });
});

describe('account mode (no key)', () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    beforeEach(() => {
        calls.length = 0;
        global.fetch = jest.fn(async (url: string, init: RequestInit) => {
            calls.push({ url, init });
            return { ok: true, status: 200, json: async () => ({ ok: true, found: false, version: 1 }) } as Response;
        }) as unknown as typeof fetch;
    });

    it('omits the token from the body when syncing as the account', async () => {
        const { pullSync, pushSync, revokeSync } = await import('../../src/utils/syncClient');
        await pullSync(null);
        await pushSync(null, 'blob', 0);
        await revokeSync(null);
        for (const c of calls) expect(JSON.parse(String(c.init.body))).not.toHaveProperty('token');
        expect(JSON.parse(String(calls[1].init.body))).toEqual({ blob: 'blob', baseVersion: 0 });
    });

    it('still sends the key when one is given', async () => {
        const { pullSync } = await import('../../src/utils/syncClient');
        await pullSync('k'.repeat(43));
        expect(JSON.parse(String(calls[0].init.body))).toEqual({ token: 'k'.repeat(43) });
    });

    it('persists and restores an account-mode device state (null token)', async () => {
        const { writeDeviceState, readDeviceState, clearDeviceState } = await import('../../src/utils/syncClient');
        writeDeviceState({ token: null, version: 3, lastBlob: 'x' });
        expect(readDeviceState()).toEqual({ token: null, version: 3, lastBlob: 'x' });
        clearDeviceState();
    });

    it('queues an old key to revoke once, then forgets it', async () => {
        const { queueKeyRevoke, takeQueuedKeyRevoke } = await import('../../src/utils/syncClient');
        queueKeyRevoke('old-key');
        expect(takeQueuedKeyRevoke()).toBe('old-key');
        expect(takeQueuedKeyRevoke()).toBeNull();
    });
});
