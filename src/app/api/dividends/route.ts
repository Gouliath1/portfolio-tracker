/**
 * Server-side cached fetcher for historical dividend events.
 *
 * Mirrors the price route: one ticker → one cached series of (ex-date,
 * amount, currency) rows. Cache is served when it covers the requested
 * start. Freshness is checked at calendar-month granularity since
 * dividends are issued infrequently — checking against the last business
 * day would force a refetch every day and waste Yahoo budget.
 *
 * Concurrent requests for the same ticker share one in-flight promise.
 */

import { NextResponse } from 'next/server';
import { fetchHistoricalDividends } from '@portfolio/core';
import {
    getCachedDividendEvents,
    getDividendRefreshedAt,
    setCachedDividendEvents,
} from '../../../lib/server/marketDataDb';

type DividendRow = { amount: number; currency: string };
type DividendMap = Record<string, DividendRow>;

const _inFlight = new Map<string, Promise<DividendMap>>();

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

// Freshness window for the dividend cache. Most issuers pay quarterly or
// semi-annually, so refetching once a week is plenty fresh and keeps us
// well under Yahoo's rate-limit budget.
const FRESHNESS_MS = 7 * 24 * 60 * 60 * 1000;

function isCacheFreshEnough(refreshedAt: Date | null): boolean {
    if (!refreshedAt) return false;
    return Date.now() - refreshedAt.getTime() < FRESHNESS_MS;
}

async function fetchAndCache(symbol: string, startDate: string): Promise<DividendMap> {
    const synthetic = [{ transactionDate: startDate, ticker: symbol }];
    const fetched = await fetchHistoricalDividends(symbol, synthetic);
    if (fetched && Object.keys(fetched).length > 0) {
        await setCachedDividendEvents(symbol, fetched);
    }
    return fetched ?? {};
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const range = searchParams.get('range') ?? '5y';
    const fresh = searchParams.get('fresh') === '1';

    if (!symbol) {
        return NextResponse.json({ error: 'symbol is required' }, { status: 400 });
    }

    const cached = await getCachedDividendEvents(symbol);
    const refreshedAt = await getDividendRefreshedAt(symbol);
    const requestedStart = rangeToStartDate(range);

    let minCached: string | null = null;
    for (const d of Object.keys(cached)) {
        if (minCached === null || d < minCached) minCached = d;
    }

    // Coverage: either the oldest cached row predates the requested window,
    // OR we have a recorded refresh (which means we've already asked Yahoo
    // for at least the range we last requested — even if no events came back
    // because the ticker never paid in that window).
    const coversStart = (minCached !== null && minCached <= requestedStart) || refreshedAt !== null;
    const cacheFresh = isCacheFreshEnough(refreshedAt);

    if (!fresh && coversStart && cacheFresh) {
        return NextResponse.json({ symbol, dividends: cached, source: 'cache' });
    }

    let promise = _inFlight.get(symbol);
    if (!promise) {
        promise = fetchAndCache(symbol, requestedStart);
        _inFlight.set(symbol, promise);
        promise.finally(() => _inFlight.delete(symbol));
    }

    try {
        const fetched = await promise;
        const merged = { ...cached, ...fetched };
        return NextResponse.json({ symbol, dividends: merged, source: 'fresh' });
    } catch (error) {
        return NextResponse.json({
            symbol,
            dividends: cached,
            source: 'error',
            error: error instanceof Error ? error.message : 'fetch failed',
        }, { status: Object.keys(cached).length > 0 ? 200 : 502 });
    }
}
