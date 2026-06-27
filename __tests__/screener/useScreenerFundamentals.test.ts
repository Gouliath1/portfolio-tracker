/**
 * Integration tests for useScreenerFundamentals hook.
 *
 * Covers:
 *  1. localStorage hydration — data survives hard page refresh
 *  2. localStorage save — setEntry persists to localStorage
 *  3. loadCached batching — one HTTP call replaces N individual calls
 *  4. loadCached failure recovery — per-page fallback unblocked on server error
 *  5. Module-level store — state persists across hook remounts (navigation)
 *  6. loadMany — fetches symbols and marks them in-store
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import {
    useScreenerFundamentals,
    __resetForTests__,
} from '../../src/hooks/useScreenerFundamentals';

const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
const LS_KEY = 'screener:fundMap:v2';
const NOW = new Date().toISOString();

const DONE_ENTRY = {
    status: 'done' as const,
    data: {
        symbol: '1234.T',
        name: 'Test Co',
        price: 1000,
        currency: 'JPY',
        trailingPE: 15,
        forwardPE: 12,
        dividendYield: 0.02,
        priceToBook: 1.5,
        marketCap: 1e11,
        sector: null,
    },
    fetchedAt: NOW,
    ratiosFetchedAt: NOW,
    ratiosPending: false,
};

beforeEach(() => {
    __resetForTests__();
    localStorage.clear();
    mockFetch.mockClear();
});

// ── 1. localStorage hydration ─────────────────────────────────────────────

describe('localStorage hydration', () => {
    it('initialises map from localStorage on first render', () => {
        localStorage.setItem(LS_KEY, JSON.stringify([['7203.T', DONE_ENTRY]]));

        const { result } = renderHook(() => useScreenerFundamentals());

        expect(result.current.map.get('7203.T')).toMatchObject({ status: 'done' });
        expect(result.current.map.get('7203.T')).toHaveProperty('data.price', 1000);
    });

    it('skips localStorage entries older than 30 days', () => {
        const staleEntry = {
            ...DONE_ENTRY,
            fetchedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(),
        };
        localStorage.setItem(LS_KEY, JSON.stringify([['OLD.T', staleEntry]]));

        const { result } = renderHook(() => useScreenerFundamentals());

        expect(result.current.map.get('OLD.T')).toBeUndefined();
    });

    it('handles corrupt localStorage gracefully', () => {
        localStorage.setItem(LS_KEY, 'not-valid-json{{{');

        expect(() => renderHook(() => useScreenerFundamentals())).not.toThrow();
    });

    it('skips non-done entries from localStorage', () => {
        const errEntry = { status: 'error', reason: 'failed' };
        localStorage.setItem(LS_KEY, JSON.stringify([['ERR.T', errEntry]]));

        const { result } = renderHook(() => useScreenerFundamentals());

        // error entries should not be hydrated
        expect(result.current.map.get('ERR.T')).toBeUndefined();
    });
});

// ── 2. localStorage save ──────────────────────────────────────────────────

describe('localStorage save', () => {
    it('persists data to localStorage after a fetch', async () => {
        jest.useFakeTimers();

        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                ...DONE_ENTRY.data,
                fetchedAt: NOW,
                ratiosFetchedAt: NOW,
                ratiosPending: false,
            }),
        } as Response);

        const { result } = renderHook(() => useScreenerFundamentals());

        await act(async () => { result.current.loadMany(['1234.T']); });
        await act(async () => { jest.advanceTimersByTime(600); });
        await waitFor(() => expect(result.current.map.get('1234.T')?.status).toBe('done'));

        act(() => { jest.runAllTimers(); });

        const saved = JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') as [string, unknown][];
        expect(saved.some(([sym]) => sym === '1234.T')).toBe(true);

        jest.useRealTimers();
    });
});

// ── 3. loadCached batching ────────────────────────────────────────────────

describe('loadCached batching', () => {
    it('calls /api/screener/quotes for N symbols in one request', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                '2345.T': { ...DONE_ENTRY.data, symbol: '2345.T', fetchedAt: NOW, ratiosFetchedAt: NOW, ratiosPending: false },
                '3456.T': { ...DONE_ENTRY.data, symbol: '3456.T', fetchedAt: NOW, ratiosFetchedAt: NOW, ratiosPending: false },
            }),
        } as Response);

        const { result } = renderHook(() => useScreenerFundamentals());
        act(() => { result.current.loadCached(['2345.T', '3456.T']); });

        await waitFor(() => expect(result.current.map.get('2345.T')?.status).toBe('done'));

        expect(mockFetch).toHaveBeenCalledTimes(1);
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/api/screener/quotes');
        expect(url).toContain('2345');
        expect(url).toContain('3456');
    });

    it('does not re-probe symbols already in the store', async () => {
        mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response);

        const { result } = renderHook(() => useScreenerFundamentals());
        act(() => { result.current.loadCached(['4567.T']); });
        await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

        mockFetch.mockClear();
        act(() => { result.current.loadCached(['4567.T']); });

        // Should NOT fire a second time — symbol is in cacheChecked
        await new Promise(r => setTimeout(r, 50));
        expect(mockFetch).toHaveBeenCalledTimes(0);
    });

    it('chunks 450 symbols into 3 requests of ≤200 each', async () => {
        const symbols = Array.from({ length: 450 }, (_, i) => `${5000 + i}.T`);
        mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) } as Response);

        const { result } = renderHook(() => useScreenerFundamentals());
        act(() => { result.current.loadCached(symbols); });

        await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3));

        for (const call of mockFetch.mock.calls) {
            const symbolsInUrl = ((call[0] as string).split('symbols=')[1] ?? '').split(',');
            expect(symbolsInUrl.length).toBeLessThanOrEqual(200);
        }
    });
});

// ── 4. loadCached failure recovery ───────────────────────────────────────

describe('loadCached failure recovery', () => {
    it('unblocks symbols from cacheChecked on non-200 response so they can be retried', async () => {
        mockFetch.mockResolvedValueOnce({ ok: false, status: 500 } as Response);

        const { result } = renderHook(() => useScreenerFundamentals());
        act(() => { result.current.loadCached(['FAIL.T']); });
        await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

        mockFetch.mockClear();
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                'FAIL.T': { ...DONE_ENTRY.data, symbol: 'FAIL.T', fetchedAt: NOW, ratiosFetchedAt: NOW, ratiosPending: false },
            }),
        } as Response);

        // Second call must be retried after server error
        act(() => { result.current.loadCached(['FAIL.T']); });
        await waitFor(() => expect(result.current.map.get('FAIL.T')?.status).toBe('done'));
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('unblocks symbols from cacheChecked on network exception', async () => {
        mockFetch.mockRejectedValueOnce(new Error('network error'));

        const { result } = renderHook(() => useScreenerFundamentals());
        act(() => { result.current.loadCached(['NEWERR.T']); });
        await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

        mockFetch.mockClear();
        mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response);

        act(() => { result.current.loadCached(['NEWERR.T']); });
        await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    });
});

// ── 5. Module-level store across remounts ─────────────────────────────────

describe('module-level store', () => {
    it('preserves data across hook remounts (simulates navigation away and back)', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                'NAV.T': { ...DONE_ENTRY.data, symbol: 'NAV.T', fetchedAt: NOW, ratiosFetchedAt: NOW, ratiosPending: false },
            }),
        } as Response);

        // First mount
        const { result, unmount } = renderHook(() => useScreenerFundamentals());
        act(() => { result.current.loadCached(['NAV.T']); });
        await waitFor(() => expect(result.current.map.get('NAV.T')?.status).toBe('done'));

        unmount(); // simulate navigating away
        mockFetch.mockClear();

        // Second mount — data must already be there, no extra fetch
        const { result: result2 } = renderHook(() => useScreenerFundamentals());
        expect(result2.current.map.get('NAV.T')?.status).toBe('done');
        expect(mockFetch).not.toHaveBeenCalled();
    });
});

// ── 6. loadMany ───────────────────────────────────────────────────────────

describe('loadMany', () => {
    it('shows loading then done state', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                ...DONE_ENTRY.data,
                symbol: 'MANY.T',
                fetchedAt: NOW,
                ratiosFetchedAt: NOW,
                ratiosPending: false,
            }),
        } as Response);

        const { result } = renderHook(() => useScreenerFundamentals());

        act(() => { result.current.loadMany(['MANY.T']); });
        expect(result.current.map.get('MANY.T')?.status).toBe('loading');

        await waitFor(() => {
            expect(result.current.map.get('MANY.T')?.status).toBe('done');
            expect(result.current.progress).toBeNull();
        });
    });

    it('sets error state when fetch fails', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 404,
            json: async () => ({ error: 'not found' }),
        } as Response);

        const { result } = renderHook(() => useScreenerFundamentals());
        act(() => { result.current.loadMany(['BADTICKER.T']); });

        await waitFor(() => expect(result.current.map.get('BADTICKER.T')?.status).toBe('error'));
    });
});
