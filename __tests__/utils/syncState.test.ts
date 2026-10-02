import {
    collectSyncBlob, applySyncBlob, parseSyncBlob, isSyncedKey, isLocalStateEmpty,
    summarizeBlob, stashBackup, hasBackup, restoreBackup,
} from '../../src/utils/syncState';

describe('syncState', () => {
    beforeEach(() => localStorage.clear());

    it('collects only allowlisted keys', () => {
        localStorage.setItem('pt_sets', '[1]');
        localStorage.setItem('pt_positions_abc', '[2]');
        localStorage.setItem('taxResidenceCountry', 'FR');
        localStorage.setItem('pt_pnl_v1_x', 'cache');
        localStorage.setItem('pt_ai_token_abc', 'secret');
        localStorage.setItem('language', 'fr');
        localStorage.setItem('screener:fundMap:v2', 'cache');
        const { entries } = JSON.parse(collectSyncBlob());
        expect(Object.keys(entries).sort()).toEqual(['pt_positions_abc', 'pt_sets', 'taxResidenceCountry']);
    });

    it('is deterministic regardless of insertion order', () => {
        localStorage.setItem('pt_sets', 'a');
        localStorage.setItem('baseCurrency', 'EUR');
        const first = collectSyncBlob();
        localStorage.clear();
        localStorage.setItem('baseCurrency', 'EUR');
        localStorage.setItem('pt_sets', 'a');
        expect(collectSyncBlob()).toBe(first);
    });

    it('round-trips onto an empty device', () => {
        localStorage.setItem('pt_sets', '[1]');
        localStorage.setItem('pt_positions_x', '[2]');
        const blob = collectSyncBlob();
        localStorage.clear();
        expect(isLocalStateEmpty()).toBe(true);
        expect(applySyncBlob(blob)).toBe(true);
        expect(localStorage.getItem('pt_positions_x')).toBe('[2]');
        expect(isLocalStateEmpty()).toBe(false);
    });

    it('removes synced keys missing from the blob, leaves others', () => {
        localStorage.setItem('pt_positions_old', 'x');
        localStorage.setItem('language', 'fr');
        localStorage.setItem('pt_ai_token_a', 't');
        const blob = JSON.stringify({ v: 1, entries: { pt_sets: '[]' } });
        expect(applySyncBlob(blob)).toBe(true);
        expect(localStorage.getItem('pt_positions_old')).toBeNull();
        expect(localStorage.getItem('language')).toBe('fr');
        expect(localStorage.getItem('pt_ai_token_a')).toBe('t');
    });

    it('refuses to write non-allowlisted keys from a blob', () => {
        const blob = JSON.stringify({ v: 1, entries: { pt_ai_token_a: 'evil', pt_sets: '[]' } });
        expect(parseSyncBlob(blob)?.entries).toEqual({ pt_sets: '[]' });
        applySyncBlob(blob);
        expect(localStorage.getItem('pt_ai_token_a')).toBeNull();
    });

    it('rejects malformed or wrong-version blobs without touching storage', () => {
        localStorage.setItem('pt_sets', 'keep');
        expect(applySyncBlob('not json')).toBe(false);
        expect(applySyncBlob(JSON.stringify({ v: 99, entries: {} }))).toBe(false);
        expect(applySyncBlob(JSON.stringify({ v: 1 }))).toBe(false);
        expect(localStorage.getItem('pt_sets')).toBe('keep');
    });

    it('classifies keys', () => {
        expect(isSyncedKey('pt_positions_123')).toBe(true);
        expect(isSyncedKey('pt_pnl_v1_x')).toBe(false);
    });
});

describe('joining a device', () => {
    beforeEach(() => localStorage.clear());
    const blob = JSON.stringify({ v: 1, entries: {
        pt_sets: JSON.stringify([{ id: 'a', display_name: 'Main', is_active: false }, { id: 'b', display_name: 'Alt', is_active: true }]),
        pt_positions_a: JSON.stringify([1, 2, 3]),
    } });

    it('activates a synced workspace on a device that never picked one', () => {
        applySyncBlob(blob);
        expect(localStorage.getItem('pt_active_set')).toBe('b');
    });
    it('keeps an existing active choice', () => {
        localStorage.setItem('pt_active_set', 'demo');
        applySyncBlob(blob);
        expect(localStorage.getItem('pt_active_set')).toBe('demo');
    });
    it('repoints a stale active choice to a synced workspace', () => {
        localStorage.setItem('pt_active_set', 'gone');
        applySyncBlob(blob);
        expect(localStorage.getItem('pt_active_set')).toBe('b');
    });
    it('replaces the demo default on a freshly joined device', () => {
        localStorage.setItem('pt_active_set', 'demo');
        applySyncBlob(blob, { freshDevice: true });
        expect(localStorage.getItem('pt_active_set')).toBe('b');
    });
    it('summarises a blob', () => {
        expect(summarizeBlob(blob)).toEqual({ workspaces: ['Main', 'Alt'], transactions: 3 });
        expect(summarizeBlob('nope')).toBeNull();
    });
    it('stashes and restores what the device had', () => {
        localStorage.setItem('pt_sets', '[1]');
        stashBackup();
        expect(hasBackup()).toBe(true);
        applySyncBlob(blob);
        expect(restoreBackup()).toBe(true);
        expect(localStorage.getItem('pt_sets')).toBe('[1]');
        expect(hasBackup()).toBe(false);
    });
});
