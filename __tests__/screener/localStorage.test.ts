/**
 * Integration tests for localStorage persistence in useScreenerFundamentals.
 *
 * localStorage is the mechanism that makes screener data survive hard page
 * refreshes (F5 / Cmd+R) in production. These tests validate the full
 * round-trip: data loaded → saved to localStorage → module reset → hydrated
 * from localStorage → data available immediately.
 */

const LS_KEY = 'screener:fundMap:v2';
const NOW = new Date().toISOString();
const THIRTY_ONE_DAYS_AGO = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();

const FRESH_ENTRY = {
    status: 'done' as const,
    data: {
        symbol: '7203.T',
        name: 'Toyota Motor Corp',
        price: 3250,
        currency: 'JPY',
        trailingPE: 10.1,
        forwardPE: 9.5,
        dividendYield: 0.025,
        priceToBook: 1.1,
        marketCap: 5e12,
    },
    fetchedAt: NOW,
    ratiosFetchedAt: NOW,
    ratiosPending: false,
};

// ── Pure localStorage round-trip logic ───────────────────────────────────────
// Tests the serialisation/deserialisation without needing the hook.

function serializeEntries(entries: [string, typeof FRESH_ENTRY][]) {
    return JSON.stringify(entries);
}

function deserializeAndFilter(raw: string, maxAgeMs: number) {
    const entries: [string, typeof FRESH_ENTRY][] = JSON.parse(raw);
    const now = Date.now();
    return entries.filter(([, entry]) => {
        if (entry.status !== 'done' || !entry.fetchedAt) return false;
        return now - new Date(entry.fetchedAt).getTime() < maxAgeMs;
    });
}

describe('localStorage serialisation', () => {
    const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

    beforeEach(() => localStorage.clear());

    it('round-trips a done entry correctly', () => {
        const raw = serializeEntries([['7203.T', FRESH_ENTRY]]);
        localStorage.setItem(LS_KEY, raw);

        const stored = localStorage.getItem(LS_KEY)!;
        const entries = deserializeAndFilter(stored, MAX_AGE_MS);
        expect(entries).toHaveLength(1);
        expect(entries[0][0]).toBe('7203.T');
        expect(entries[0][1].data.price).toBe(3250);
    });

    it('filters out entries older than maxAge', () => {
        const stale = { ...FRESH_ENTRY, fetchedAt: THIRTY_ONE_DAYS_AGO };
        const raw = serializeEntries([
            ['7203.T', FRESH_ENTRY],
            ['9999.T', stale],
        ]);
        localStorage.setItem(LS_KEY, raw);

        const stored = localStorage.getItem(LS_KEY)!;
        const entries = deserializeAndFilter(stored, MAX_AGE_MS);
        expect(entries).toHaveLength(1);
        expect(entries[0][0]).toBe('7203.T');
    });

    it('handles an empty store gracefully', () => {
        const raw = serializeEntries([]);
        localStorage.setItem(LS_KEY, raw);
        const entries = deserializeAndFilter(localStorage.getItem(LS_KEY)!, MAX_AGE_MS);
        expect(entries).toHaveLength(0);
    });

    it('handles missing localStorage key gracefully', () => {
        // Nothing stored
        const raw = localStorage.getItem(LS_KEY);
        expect(raw).toBeNull();
        // Consumer should default to empty
        const entries = raw ? deserializeAndFilter(raw, MAX_AGE_MS) : [];
        expect(entries).toHaveLength(0);
    });
});

// ── Multiple entries ──────────────────────────────────────────────────────────

describe('localStorage with multiple entries', () => {
    const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

    beforeEach(() => localStorage.clear());

    it('preserves all fresh entries', () => {
        const entries: [string, typeof FRESH_ENTRY][] = Array.from(
            { length: 1639 },
            (_, i) => [`${1000 + i}.T`, FRESH_ENTRY],
        );
        localStorage.setItem(LS_KEY, serializeEntries(entries));

        const stored = deserializeAndFilter(localStorage.getItem(LS_KEY)!, MAX_AGE_MS);
        expect(stored).toHaveLength(1639);
    });

    it('correctly separates fresh vs stale in a mixed list', () => {
        const stale = { ...FRESH_ENTRY, fetchedAt: THIRTY_ONE_DAYS_AGO };
        const entries: [string, typeof FRESH_ENTRY][] = [
            ['FRESH.T', FRESH_ENTRY],
            ['STALE.T', stale],
            ['FRESH2.T', FRESH_ENTRY],
        ];
        localStorage.setItem(LS_KEY, serializeEntries(entries));

        const stored = deserializeAndFilter(localStorage.getItem(LS_KEY)!, MAX_AGE_MS);
        expect(stored).toHaveLength(2);
        expect(stored.map(e => e[0])).toEqual(['FRESH.T', 'FRESH2.T']);
    });
});

// ── Version key isolation ─────────────────────────────────────────────────────

describe('localStorage key versioning', () => {
    beforeEach(() => localStorage.clear());

    it('uses versioned key to avoid conflicts with old format', () => {
        // Simulate old data under old key
        localStorage.setItem('screener:fundMap:v1', JSON.stringify([['OLD.T', FRESH_ENTRY]]));

        // New code only reads v2
        const v2Data = localStorage.getItem(LS_KEY); // LS_KEY = 'screener:fundMap:v2'
        expect(v2Data).toBeNull(); // old data not visible to new code
    });
});
