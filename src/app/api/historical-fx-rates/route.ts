/**
 * Server-side cached fetcher for historical FX rates.
 *
 * Same shape as /api/historical-prices: one pair → one daily series in
 * cache; refresh when the requested window isn't fully covered or the
 * latest cached date isn't from the last business day.
 */

import { NextResponse } from 'next/server';
import { fetchHistoricalFxRates } from '@portfolio/core';
import {
    getCachedHistoricalFxRates,
    setCachedHistoricalFxRates,
} from '../../../lib/server/marketDataDb';

type RateMap = Record<string, number>;

const _inFlight = new Map<string, Promise<RateMap>>();

function lastExpectedBusinessDay(): string {
    const d = new Date();
    while (d.getDay() === 0 || d.getDay() === 6) {
        d.setDate(d.getDate() - 1);
    }
    return d.toISOString().split('T')[0];
}

function buildFillRange(earliest: string): string[] {
    // Generate every calendar day from `earliest` through today. The Yahoo
    // fetch ignores most of these (it returns its own trading-day grid) but
    // we use the range to size the Yahoo `range=` window correctly.
    const dates: string[] = [];
    const start = new Date(earliest);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
        dates.push(d.toISOString().split('T')[0]);
    }
    return dates;
}

async function fetchAndCache(pair: string, earliestDate: string): Promise<RateMap> {
    const dates = buildFillRange(earliestDate);
    const fetched = await fetchHistoricalFxRates(pair, dates);
    if (fetched && Object.keys(fetched).length > 0) {
        await setCachedHistoricalFxRates(pair, fetched);
    }
    return fetched ?? {};
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const pair = searchParams.get('pair');
    const datesParam = searchParams.get('dates');

    if (!pair) {
        return NextResponse.json({ error: 'pair is required' }, { status: 400 });
    }

    const requestedDates = datesParam ? datesParam.split(',').filter(Boolean) : [];
    const cached = await getCachedHistoricalFxRates(pair);
    const cachedDates = Object.keys(cached);

    let minCached: string | null = null;
    let maxCached: string | null = null;
    for (const d of cachedDates) {
        if (minCached === null || d < minCached) minCached = d;
        if (maxCached === null || d > maxCached) maxCached = d;
    }

    const requestedStart = requestedDates.length > 0
        ? requestedDates.reduce((a, b) => (a < b ? a : b))
        : null;

    const coversStart = requestedStart === null
        ? cachedDates.length > 0
        : minCached !== null && minCached <= requestedStart;
    const isFresh = maxCached !== null && maxCached >= lastExpectedBusinessDay();

    if (coversStart && isFresh) {
        return NextResponse.json({ pair, rates: cached, source: 'cache' });
    }

    const earliest = requestedStart ?? minCached ?? lastExpectedBusinessDay();

    let promise = _inFlight.get(pair);
    if (!promise) {
        promise = fetchAndCache(pair, earliest);
        _inFlight.set(pair, promise);
        promise.finally(() => _inFlight.delete(pair));
    }

    try {
        const fresh = await promise;
        return NextResponse.json({ pair, rates: { ...cached, ...fresh }, source: 'fresh' });
    } catch (error) {
        return NextResponse.json({
            pair,
            rates: cached,
            source: 'error',
            error: error instanceof Error ? error.message : 'fetch failed',
        }, { status: cachedDates.length > 0 ? 200 : 502 });
    }
}
