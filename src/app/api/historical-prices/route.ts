/**
 * Server-side cached fetcher for historical stock prices.
 *
 * One ticker → one daily series in cache. Both the chart and the daily P&L
 * hook read from the same series; we never mix resolutions in storage.
 *
 * On every request we:
 *   1. Compute the start date the caller needs from ?range=.
 *   2. Look up cached daily prices for the ticker.
 *   3. If the cache covers the requested start AND its latest row is from
 *      the last expected business day, serve cache.
 *   4. Otherwise fetch the missing window from Yahoo (always interval=1d),
 *      merge into cache, and serve the merged series.
 *
 * Concurrent requests for the same ticker share one in-flight promise so
 * Strict-Mode double-mounts and parallel components don't trigger duplicate
 * Yahoo fetches and 429s.
 */

import { NextResponse } from 'next/server';
import { fetchHistoricalPrices } from '@portfolio/core';
import {
    getCachedHistoricalPrices,
    setCachedHistoricalPrices,
} from '../../../lib/server/marketDataDb';

type PriceMap = Record<string, number>;

const _inFlight = new Map<string, Promise<PriceMap>>();

function rangeToStartDate(range: string): string {
    const now = new Date();
    const match = /^(\d+)([dy])$/.exec(range);
    if (match) {
        const n = parseInt(match[1], 10);
        if (match[2] === 'y') now.setFullYear(now.getFullYear() - n);
        else if (match[2] === 'd') now.setDate(now.getDate() - n);
    } else if (range === 'max') {
        now.setFullYear(now.getFullYear() - 30);
    }
    return now.toISOString().split('T')[0];
}

function lastExpectedBusinessDay(): string {
    const d = new Date();
    while (d.getDay() === 0 || d.getDay() === 6) {
        d.setDate(d.getDate() - 1);
    }
    return d.toISOString().split('T')[0];
}

async function fetchAndCache(symbol: string, startDate: string): Promise<PriceMap> {
    const synthetic = [{ transactionDate: startDate, ticker: symbol }];
    const fetched = await fetchHistoricalPrices(symbol, synthetic, '1d');
    if (fetched && Object.keys(fetched).length > 0) {
        await setCachedHistoricalPrices(symbol, fetched);
    }
    return fetched ?? {};
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const range = searchParams.get('range') ?? '5y';

    if (!symbol) {
        return NextResponse.json({ error: 'symbol is required' }, { status: 400 });
    }

    const cached = await getCachedHistoricalPrices(symbol);
    const cachedDates = Object.keys(cached);
    const requestedStart = rangeToStartDate(range);
    const lastBusinessDay = lastExpectedBusinessDay();

    let minCached: string | null = null;
    let maxCached: string | null = null;
    for (const d of cachedDates) {
        if (minCached === null || d < minCached) minCached = d;
        if (maxCached === null || d > maxCached) maxCached = d;
    }

    const coversStart = minCached !== null && minCached <= requestedStart;
    const isFresh = maxCached !== null && maxCached >= lastBusinessDay;

    if (coversStart && isFresh) {
        return NextResponse.json({ symbol, prices: cached, source: 'cache' });
    }

    // Need to refetch. Coalesce concurrent requests for this ticker.
    let promise = _inFlight.get(symbol);
    if (!promise) {
        promise = fetchAndCache(symbol, requestedStart);
        _inFlight.set(symbol, promise);
        promise.finally(() => _inFlight.delete(symbol));
    }

    try {
        const fresh = await promise;
        const merged = { ...cached, ...fresh };
        return NextResponse.json({ symbol, prices: merged, source: 'fresh' });
    } catch (error) {
        return NextResponse.json({
            symbol,
            prices: cached,
            source: 'error',
            error: error instanceof Error ? error.message : 'fetch failed',
        }, { status: Object.keys(cached).length > 0 ? 200 : 502 });
    }
}
