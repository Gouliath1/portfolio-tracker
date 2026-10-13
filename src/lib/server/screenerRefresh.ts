/**
 * Per-symbol screener refresh, shared by the single-symbol route and the
 * batch route so both follow one freshness policy and neither writes to the
 * DB itself — they get back the rows to persist and write them in one batch.
 *
 * Two tiers (see project_screener_flow):
 *   - price/name/currency  → no-auth Yahoo chart endpoint
 *   - PE / fwd PE / div / P/B / mkt cap / sector → Yahoo quoteSummary
 *     (JP: J-Quants primary)
 *
 * Freshness is shared across users. Prices are "fresh" for the whole market
 * day (see `marketDay`), so the first refresh of the day fetches and everyone
 * after reads the DB. Ratios update quarterly, so 7 days is fine.
 */

import { fetchChartMeta } from '@portfolio/core';
import type { StockFundamentals } from '@portfolio/types/screener';
import { fetchJQuantsRatios } from './jquantsApi';
import { fetchQuoteSummary, fetchYahooSector } from './yahooAuth';
import type { FundamentalsWrite, PriceInfo, RatioInfo } from './marketDataDb';
import { marketDay } from './dateUtils';

export const RATIO_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface CachedRow {
    data: StockFundamentals;
    fetchedAt: string;
    ratiosFetchedAt: string | null;
}

export interface RefreshOptions {
    /** Refetch both tiers regardless of freshness (already throttled by the caller). */
    forceFresh?: boolean;
    /** Skip the crumb-gated ratios tier. */
    priceOnly?: boolean;
    /** Override the same-market-day price policy with a max age (e.g. alert polling). */
    priceMaxAgeMs?: number;
}

export interface RefreshOutcome {
    result: StockFundamentals;
    source: 'cache' | 'merged' | 'fresh';
    ratiosPending: boolean;
    ratiosError?: string;
    fetchedAt: string;
    ratiosFetchedAt: string | null;
    /** Rows to persist; null when everything was already fresh. */
    write: FundamentalsWrite | null;
    /** True when a price/ratio fetch was actually attempted upstream. */
    touchedUpstream: boolean;
    /** True when nothing usable could be produced. */
    failed: boolean;
}

const empty = (symbol: string): StockFundamentals => ({
    symbol, name: null, price: null, currency: null,
    trailingPE: null, forwardPE: null, dividendYield: null, priceToBook: null, marketCap: null,
    sector: null,
});

const withinAge = (ts: string | null | undefined, maxMs: number, now: number) =>
    !!ts && now - new Date(ts).getTime() < maxMs;

export function isPriceFresh(fetchedAt: string | null | undefined, opts: RefreshOptions, now = Date.now()): boolean {
    if (!fetchedAt) return false;
    if (opts.priceMaxAgeMs !== undefined) return withinAge(fetchedAt, opts.priceMaxAgeMs, now);
    return marketDay(fetchedAt) === marketDay(now);
}

const inFlight = new Map<string, Promise<RefreshOutcome>>();

/**
 * Compute the refreshed state for one symbol. Concurrent calls for the same
 * symbol (several users, several tabs) share one upstream fetch.
 */
export function refreshSymbol(
    symbol: string,
    cached: CachedRow | null,
    opts: RefreshOptions = {},
): Promise<RefreshOutcome> {
    const key = `${symbol}|${opts.forceFresh ? 'f' : ''}${opts.priceOnly ? 'p' : ''}${opts.priceMaxAgeMs ?? ''}`;
    const existing = inFlight.get(key);
    if (existing) return existing;
    const promise = compute(symbol, cached, opts).finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
    return promise;
}

async function compute(symbol: string, cached: CachedRow | null, opts: RefreshOptions): Promise<RefreshOutcome> {
    const now = Date.now();
    const forceFresh = !!opts.forceFresh;
    let result: StockFundamentals = cached?.data ?? empty(symbol);

    const priceFresh = !forceFresh && isPriceFresh(cached?.fetchedAt, opts, now) && result.price != null;
    let ratiosOk = !forceFresh && withinAge(cached?.ratiosFetchedAt, RATIO_MAX_AGE_MS, now);
    let ratiosError: string | undefined;
    let touchedUpstream = false;

    let priceWrite: PriceInfo | undefined;
    let ratiosWrite: (RatioInfo & { sector?: string | null }) | undefined;

    // Tier 1 — price/name/currency.
    if (!priceFresh) {
        touchedUpstream = true;
        const meta = await fetchChartMeta(symbol);
        if (meta) {
            priceWrite = meta;
            result = { ...result, name: meta.name, price: meta.price, currency: meta.currency };
        }
    }

    // Tier 2 — ratios + sector.
    const isJpTicker = symbol.toUpperCase().endsWith('.T');
    let sector: string | null = result.sector ?? null;
    const shouldFetchSector = !opts.priceOnly && sector == null;

    if (!ratiosOk && !opts.priceOnly) {
        touchedUpstream = true;
        try {
            let ratios: RatioInfo | null = null;
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
                const qs = await fetchQuoteSummary(symbol);
                ratios = {
                    trailingPE: qs.trailingPE, forwardPE: qs.forwardPE,
                    dividendYield: qs.dividendYield, priceToBook: qs.priceToBook,
                    marketCap: qs.marketCap,
                };
                if (shouldFetchSector && qs.sector != null) sector = qs.sector;
            }
            ratiosWrite = { ...ratios, sector };
            result = { ...result, ...ratios, sector };
            ratiosOk = true;
        } catch (error) {
            ratiosError = error instanceof Error ? error.message : 'ratios fetch failed';
        }
    } else if (shouldFetchSector) {
        // Ratios fresh but sector never cached: fetch it standalone.
        touchedUpstream = true;
        try {
            const s = await fetchYahooSector(symbol);
            if (s != null) {
                sector = s;
                result = { ...result, sector };
                ratiosWrite = {
                    trailingPE: result.trailingPE, forwardPE: result.forwardPE,
                    dividendYield: result.dividendYield, priceToBook: result.priceToBook,
                    marketCap: result.marketCap, sector,
                };
            }
        } catch { /* sector is non-fatal */ }
    }

    const failed = result.price == null && result.trailingPE == null && !cached;
    const nowIso = new Date(now).toISOString();
    return {
        result,
        source: !touchedUpstream ? 'cache' : cached ? 'merged' : 'fresh',
        ratiosPending: !ratiosOk,
        ratiosError,
        fetchedAt: !priceFresh ? nowIso : (cached?.fetchedAt ?? nowIso),
        ratiosFetchedAt: ratiosOk ? (ratiosWrite ? nowIso : (cached?.ratiosFetchedAt ?? nowIso)) : (cached?.ratiosFetchedAt ?? null),
        write: priceWrite || ratiosWrite ? { ticker: symbol, price: priceWrite, ratios: ratiosWrite } : null,
        touchedUpstream,
        failed,
    };
}
