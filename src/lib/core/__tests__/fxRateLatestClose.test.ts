/**
 * @jest-environment node
 *
 * Guards the rule that "current" FX uses the latest *completed daily close*
 * (Yahoo `meta.chartPreviousClose`) rather than the live intraday spot
 * (`meta.regularMarketPrice`). Live spot moves every tick, so using it makes
 * portfolio values irreproducible across fetches and between dev/prod.
 */

import { fetchCurrentFxRate } from '@portfolio/core/yahooFinanceApi';

type ChartFields = { chartPreviousClose?: number; regularMarketPrice?: number };

function mockYahooChart(fields: ChartFields) {
    global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
            chart: { result: [{ meta: fields }] },
        }),
    }) as unknown as typeof fetch;
}

describe('fetchCurrentFxRate — latest close, not live spot', () => {
    const realFetch = global.fetch;
    afterEach(() => {
        global.fetch = realFetch;
        jest.restoreAllMocks();
    });

    it('returns the latest completed daily close (chartPreviousClose), not the live spot', async () => {
        // Live spot (159.957) differs from the settled close (159.887). We must
        // return the close so two fetches a tick apart agree.
        mockYahooChart({ chartPreviousClose: 159.887, regularMarketPrice: 159.957 });

        const rate = await fetchCurrentFxRate('USDJPY', true);

        expect(rate).toBe(159.887);
    });

    it('falls back to regularMarketPrice when no close is available', async () => {
        mockYahooChart({ regularMarketPrice: 170.5 });

        const rate = await fetchCurrentFxRate('EURJPY', true);

        expect(rate).toBe(170.5);
    });

    it('returns null when neither close nor spot is present', async () => {
        mockYahooChart({});

        const rate = await fetchCurrentFxRate('GBPJPY', true);

        expect(rate).toBeNull();
    });
});
