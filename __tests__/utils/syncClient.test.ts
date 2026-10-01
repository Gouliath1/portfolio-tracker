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
    it('recreate when the server row is gone', () => {
        expect(planSync({ localBlob: 'A', device: dev, server: null })).toBe('recreate');
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
