/**
 * @jest-environment jsdom
 *
 * The localhost gate is a privacy boundary: on a hosted deployment the
 * visitor's positions must never leave their browser. A regression here would
 * be silent — the app would keep working perfectly while quietly uploading
 * someone's holdings to whoever runs the deployment — so it gets its own test.
 */

import { publishSnapshot, isLocalHost } from '../../src/utils/publishSnapshot';
import type { PortfolioSnapshot } from '../../src/utils/portfolioSnapshot';

const SNAPSHOT = {
    generatedAt: '2026-09-12',
    baseCurrency: 'JPY',
    portfolioName: 'Test',
    holdingCount: 0,
    totals: {
        value: 0, cost: 0, unrealizedPnl: 0, unrealizedPnlPct: 0,
        realizedPnl: 0, realizedPnlPct: 0, dividends: 0, totalReturnPct: 0,
    },
    holdings: [],
    byAssetClass: [],
    byCurrency: [],
    byAccount: [],
    top5Pct: 0,
    closedCount: 0,
    recentClosed: [],
} as PortfolioSnapshot;

function setHostname(hostname: string): void {
    // jsdom's location is read-only; redefining is the supported escape hatch.
    Object.defineProperty(window, 'location', {
        value: { ...window.location, hostname },
        writable: true,
        configurable: true,
    });
}

describe('publishSnapshot', () => {
    let fetchMock: jest.Mock;

    beforeEach(() => {
        fetchMock = jest.fn().mockResolvedValue({ ok: true });
        global.fetch = fetchMock as unknown as typeof fetch;
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it.each(['localhost', '127.0.0.1', '::1'])('publishes when served from %s', async (hostname) => {
        setHostname(hostname);

        await expect(publishSnapshot(SNAPSHOT, '# brief')).resolves.toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('/api/snapshot');
        expect(init.method).toBe('POST');
        expect(JSON.parse(init.body)).toEqual({ snapshot: SNAPSHOT, markdown: '# brief' });
    });

    it.each([
        'portfolio-tracker.vercel.app',
        'example.com',
        'localhost.evil.com',
        '192.168.1.50',
    ])('sends nothing when served from %s', async (hostname) => {
        setHostname(hostname);

        await expect(publishSnapshot(SNAPSHOT, '# brief')).resolves.toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('reports failure rather than throwing when the bridge is unavailable', async () => {
        setHostname('localhost');
        fetchMock.mockRejectedValue(new Error('connection refused'));

        await expect(publishSnapshot(SNAPSHOT, '# brief')).resolves.toBe(false);
    });

    it('reports failure on a non-OK response', async () => {
        setHostname('localhost');
        fetchMock.mockResolvedValue({ ok: false, status: 503 });

        await expect(publishSnapshot(SNAPSHOT, '# brief')).resolves.toBe(false);
    });

    it('treats a hostname that merely contains "localhost" as remote', () => {
        setHostname('notlocalhost');
        expect(isLocalHost()).toBe(false);
    });
});
