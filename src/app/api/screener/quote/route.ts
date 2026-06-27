/**
 * Per-symbol screener data, sourced in two tiers (see project_screener_flow):
 *   - Price / name / currency  → no-auth Yahoo chart endpoint (reliable, always tried)
 *   - PE / Fwd PE / div / P/B / mkt cap → Yahoo quoteSummary (JP: J-Quants primary)
 *
 * Each tier has its own freshness in the DB cache. The response carries
 * `ratiosPending` so the UI can show price now and "…" for the ratios.
 * `cachedOnly=1` restores from DB with no upstream calls (page load);
 * `fresh=1` forces a refetch of both tiers (per-row refresh button).
 */

import { NextResponse } from 'next/server';
import { fetchChartMeta } from '@portfolio/core';
import { fetchJQuantsRatios } from '../../../../lib/server/jquantsApi';
import { fetchQuoteSummary, fetchYahooSector } from '../../../../lib/server/yahooAuth';
import { getCachedFundamentals, setCachedPriceInfo, setCachedRatios } from '../../../../lib/server/marketDataDb';
import type { StockFundamentals } from '@portfolio/types/screener';

// Prices refresh daily; ratios update quarterly so 7 days is fine.
// Keeping stale ratios avoids forcing a slow reload when the user just wants
// to browse — stale data is shown with a visual indicator in the UI.
const PRICE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const RATIO_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_HEADERS = { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' };

const withinAge = (ts: string | null | undefined, maxMs: number) =>
    !!ts && Date.now() - new Date(ts).getTime() < maxMs;

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
            {
                ...cached.data,
                source: 'cache',
                ratiosPending: cached.ratiosFetchedAt == null,
                fetchedAt: cached.fetchedAt,
                ratiosFetchedAt: cached.ratiosFetchedAt,
            },
            { headers: CACHE_HEADERS },
        );
    }

    // Start from whatever we have cached; fill the stale/missing tiers below.
    let result: StockFundamentals = cached?.data ?? {
        symbol, name: null, price: null, currency: null,
        trailingPE: null, forwardPE: null, dividendYield: null, priceToBook: null, marketCap: null,
        sector: null,
    };
    const priceFresh = !forceFresh && withinAge(cached?.fetchedAt, PRICE_MAX_AGE_MS) && result.price != null;
    let ratiosOk = !forceFresh && withinAge(cached?.ratiosFetchedAt, RATIO_MAX_AGE_MS);
    let ratiosError: string | undefined;

    // Tier 1 — price/name/currency from the no-auth chart endpoint.
    if (!priceFresh) {
        const meta = await fetchChartMeta(symbol);
        if (meta) {
            await setCachedPriceInfo(symbol, meta);
            result = { ...result, name: meta.name, price: meta.price, currency: meta.currency };
        }
    }

    // Tier 2 — valuation ratios + sector.
    //   JP (.T) with J-Quants → J-Quants (ratios) + Yahoo summaryProfile (sector) in parallel
    //   All others            → Yahoo quoteSummary (ratios AND sector, single call)
    // Skipped entirely for price-only (bulk) loads.
    const isJpTicker = symbol.toUpperCase().endsWith('.T');
    // Sector: fetch whenever it's missing from cache (doesn't expire like ratios).
    let sector: string | null = result.sector ?? null;
    const shouldFetchSector = !priceOnly && sector == null;

    if (!ratiosOk && !priceOnly) {
        try {
            let ratios: { trailingPE: number | null; forwardPE: number | null; dividendYield: number | null; priceToBook: number | null; marketCap: number | null; } | null = null;

            const hasJQuants = process.env.JQUANTS_API_KEY || (process.env.JQUANTS_EMAIL && process.env.JQUANTS_PASSWORD);
            if (isJpTicker && hasJQuants) {
                try {
                    const [r, s] = await Promise.all([
                        fetchJQuantsRatios(symbol, result.price),
                        shouldFetchSector ? fetchYahooSector(symbol).catch(() => null) : Promise.resolve(null),
                    ]);
                    ratios = r;
                    if (s != null) sector = s;
                } catch { /* fall through to Yahoo */ }
            }

            if (!ratios) {
                // Yahoo quoteSummary fallback: covers all markets when crumb is available.
                // summaryProfile module is included in MODULES so sector comes for free.
                const qs = await fetchQuoteSummary(symbol);
                ratios = {
                    trailingPE: qs.trailingPE, forwardPE: qs.forwardPE,
                    dividendYield: qs.dividendYield, priceToBook: qs.priceToBook,
                    marketCap: qs.marketCap,
                };
                if (shouldFetchSector && qs.sector != null) sector = qs.sector;
            }

            await setCachedRatios(symbol, ratios, sector);
            result = { ...result, ...ratios, sector };
            ratiosOk = true;
        } catch (error) {
            ratiosError = error instanceof Error ? error.message : 'ratios fetch failed';
        }
    } else if (shouldFetchSector) {
        // Ratios are already fresh but sector was never cached (stocks fetched before this
        // feature landed). Fetch sector standalone so the UI can show it immediately.
        try {
            const s = await fetchYahooSector(symbol);
            if (s != null) {
                sector = s;
                result = { ...result, sector };
                await setCachedRatios(symbol, {
                    trailingPE: result.trailingPE, forwardPE: result.forwardPE,
                    dividendYield: result.dividendYield, priceToBook: result.priceToBook,
                    marketCap: result.marketCap,
                }, sector);
            }
        } catch { /* sector is non-fatal */ }
    }

    // Total failure (no price, no ratios, nothing cached) → surface the reason.
    if (result.price == null && result.trailingPE == null && !cached) {
        return NextResponse.json({ error: ratiosError ?? 'fetch failed', symbol }, { status: 502 });
    }

    const now = new Date().toISOString();
    return NextResponse.json(
        {
            ...result,
            source: cached ? 'merged' : 'fresh',
            ratiosPending: !ratiosOk,
            fetchedAt: !priceFresh ? now : (cached?.fetchedAt ?? now),
            ratiosFetchedAt: ratiosOk ? now : (cached?.ratiosFetchedAt ?? null),
            ...(ratiosError ? { ratiosError } : {}),
        },
        { headers: CACHE_HEADERS },
    );
}
