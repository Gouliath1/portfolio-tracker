/**
 * Per-symbol screener data, sourced in two tiers (see project_screener_flow):
 *   - Price / name / currency  → no-auth Yahoo chart endpoint (reliable, always tried)
 *   - PE / Fwd PE / div / P/B / mkt cap → Twelve Data /statistics (primary) or
 *     Yahoo quoteSummary fallback when TWELVE_DATA_API_KEY is not set.
 *
 * Each tier has its own freshness in the DB cache. The response carries
 * `ratiosPending` so the UI can show price now and "…" for the ratios.
 * `cachedOnly=1` restores from DB with no upstream calls (page load);
 * `fresh=1` forces a refetch of both tiers (per-row refresh button).
 */

import { NextResponse } from 'next/server';
import { fetchChartMeta } from '@portfolio/core';
import { fetchTwelveDataRatios } from '../../../../lib/server/twelveDataApi';
import { fetchJQuantsRatios } from '../../../../lib/server/jquantsApi';
import { fetchQuoteSummary } from '../../../../lib/server/yahooAuth';
import { getCachedFundamentals, setCachedPriceInfo, setCachedRatios } from '../../../../lib/server/marketDataDb';
import type { StockFundamentals } from '@portfolio/types/screener';

const MAX_AGE_MS = 24 * 60 * 60 * 1000; // refresh each tier at most once/day
const CACHE_HEADERS = { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' };

const within = (ts: string | null | undefined) => !!ts && Date.now() - new Date(ts).getTime() < MAX_AGE_MS;

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const forceFresh = searchParams.get('fresh') === '1';
    const cachedOnly = searchParams.get('cachedOnly') === '1';
    // tier=price → fetch only the no-auth price tier (skip the crumb-gated ratios).
    // Used by the paced "Load page" so a bulk load never hammers getcrumb.
    const priceOnly = searchParams.get('tier') === 'price';

    if (!symbol) {
        return NextResponse.json({ error: 'symbol is required' }, { status: 400 });
    }

    const cached = await getCachedFundamentals(symbol);

    if (cachedOnly) {
        if (!cached) return new NextResponse(null, { status: 204 });
        return NextResponse.json(
            { ...cached.data, source: 'cache', ratiosPending: cached.data.trailingPE == null },
            { headers: CACHE_HEADERS },
        );
    }

    // Start from whatever we have cached; fill the stale/missing tiers below.
    let result: StockFundamentals = cached?.data ?? {
        symbol, name: null, price: null, currency: null,
        trailingPE: null, forwardPE: null, dividendYield: null, priceToBook: null, marketCap: null,
    };
    const priceFresh = !forceFresh && within(cached?.fetchedAt) && result.price != null;
    let ratiosOk = !forceFresh && within(cached?.ratiosFetchedAt);
    let ratiosError: string | undefined;

    // Tier 1 — price/name/currency from the no-auth chart endpoint.
    if (!priceFresh) {
        const meta = await fetchChartMeta(symbol);
        if (meta) {
            await setCachedPriceInfo(symbol, meta);
            result = { ...result, name: meta.name, price: meta.price, currency: meta.currency };
        }
    }

    // Tier 2 — valuation ratios. Provider routing by ticker type:
    //   JP (.T)  → J-Quants (official JPX data, free plan, no crumb)
    //   US       → Twelve Data (free plan covers /statistics for US)
    //   Fallback → Yahoo quoteSummary (for any market, needs crumb)
    // Skipped entirely for price-only (bulk) loads.
    const isJpTicker = symbol.toUpperCase().endsWith('.T');
    const isUsTicker = !symbol.includes('.');
    if (!ratiosOk && !priceOnly) {
        try {
            let ratios: { trailingPE: number | null; forwardPE: number | null; dividendYield: number | null; priceToBook: number | null; marketCap: number | null; } | null = null;

            const hasJQuants = process.env.JQUANTS_API_KEY || (process.env.JQUANTS_EMAIL && process.env.JQUANTS_PASSWORD);
            if (isJpTicker && hasJQuants) {
                ratios = await fetchJQuantsRatios(symbol, result.price);
            } else if (isUsTicker && process.env.TWELVE_DATA_API_KEY) {
                ratios = await fetchTwelveDataRatios(symbol);
            }

            if (!ratios) {
                // Yahoo quoteSummary fallback: covers all markets when crumb is available.
                const qs = await fetchQuoteSummary(symbol);
                ratios = {
                    trailingPE: qs.trailingPE, forwardPE: qs.forwardPE,
                    dividendYield: qs.dividendYield, priceToBook: qs.priceToBook,
                    marketCap: qs.marketCap,
                };
            }

            await setCachedRatios(symbol, ratios);
            result = { ...result, ...ratios };
            ratiosOk = true;
        } catch (error) {
            ratiosError = error instanceof Error ? error.message : 'ratios fetch failed';
        }
    }

    // Total failure (no price, no ratios, nothing cached) → surface the reason.
    if (result.price == null && result.trailingPE == null && !cached) {
        return NextResponse.json({ error: ratiosError ?? 'fetch failed', symbol }, { status: 502 });
    }

    return NextResponse.json(
        { ...result, source: cached ? 'merged' : 'fresh', ratiosPending: !ratiosOk, ...(ratiosError ? { ratiosError } : {}) },
        { headers: CACHE_HEADERS },
    );
}
