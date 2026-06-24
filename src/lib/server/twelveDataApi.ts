/**
 * Twelve Data /statistics endpoint for screener fundamentals.
 *
 * Replaces the Yahoo crumb-authed quoteSummary path (which is unreliable due to
 * per-IP rate-limiting on getcrumb). Twelve Data covers 70+ exchanges including
 * Tokyo (JPX), returns trailing/forward PE, price-to-book, dividend yield, and
 * market cap on the free tier (800 calls/day, 8/min — plenty for on-demand
 * per-row fetching with the 24h DB cache).
 *
 * Symbol mapping: Yahoo uses "7203.T", Twelve Data uses "7203" + exchange=JPX.
 * US tickers pass through unchanged (AAPL → AAPL, no exchange param).
 */

import type { RatioInfo } from './marketDataDb';

const API_BASE = 'https://api.twelvedata.com';

// Detect JP tickers (Yahoo's ".T" suffix = Tokyo) and map to Twelve Data's
// exchange parameter. Add more suffixes here when adding other indices.
const SUFFIX_TO_EXCHANGE: Record<string, string> = {
    '.T': 'JPX',
};

function toTwelveDataSymbol(yahooSymbol: string): { symbol: string; exchange?: string } {
    for (const [suffix, exchange] of Object.entries(SUFFIX_TO_EXCHANGE)) {
        if (yahooSymbol.toUpperCase().endsWith(suffix)) {
            return { symbol: yahooSymbol.slice(0, -suffix.length), exchange };
        }
    }
    return { symbol: yahooSymbol };
}

function num(v: unknown): number | null {
    if (v == null || v === '' || v === 'N/A') return null;
    const n = Number(v);
    return isFinite(n) ? n : null;
}

export async function fetchTwelveDataRatios(yahooSymbol: string): Promise<RatioInfo> {
    const apiKey = process.env.TWELVE_DATA_API_KEY;
    if (!apiKey) throw new Error('TWELVE_DATA_API_KEY not set');

    const { symbol, exchange } = toTwelveDataSymbol(yahooSymbol);
    const params = new URLSearchParams({ symbol, apikey: apiKey });
    if (exchange) params.set('exchange', exchange);

    const res = await fetch(`${API_BASE}/statistics?${params}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) throw new Error(`Twelve Data HTTP ${res.status}`);
    const data = await res.json();

    if (data.status === 'error') throw new Error(`Twelve Data: ${data.message}`);

    const val = data?.statistics?.valuations_metrics ?? {};
    const div = data?.statistics?.dividends_and_splits ?? {};

    // Field locations confirmed against live response for Toyota 7203/JPX:
    //   valuations_metrics: trailing_pe, forward_pe, price_to_book_mrq, market_capitalization
    //   dividends_and_splits: trailing_annual_dividend_yield (already a fraction, e.g. 0.035)
    const trailingPE    = num(val.trailing_pe);
    const forwardPE     = num(val.forward_pe);
    const priceToBook   = num(val.price_to_book_mrq) ?? num(val.price_to_book);
    const rawYield      = num(div.trailing_annual_dividend_yield) ?? num(div.forward_annual_dividend_yield);
    // TD yields are fractions (0.035). Guard against any future percentage form (>1).
    const dividendYield = rawYield != null ? (rawYield > 1 ? rawYield / 100 : rawYield) : null;
    const marketCap     = num(val.market_capitalization);

    return { trailingPE, forwardPE, priceToBook, dividendYield, marketCap };
}
