import {
    collectSyncBlob, applySyncBlob, parseSyncBlob, isSyncedKey, isLocalStateEmpty,
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
