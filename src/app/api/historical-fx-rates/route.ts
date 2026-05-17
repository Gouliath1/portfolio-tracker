/**
 * Server-side cached fetcher for historical FX rates.
 * Same architecture as /api/historical-prices: SQLite cache → Yahoo fallback,
 * with in-flight dedup for concurrent requests.
 */

import { NextResponse } from 'next/server';
import { fetchHistoricalFxRates } from '@portfolio/core';
import {
    getCachedHistoricalFxRates,
    setCachedHistoricalFxRates,
} from '../../../lib/server/marketDataDb';

type RateMap = Record<string, number>;

const _inFlight = new Map<string, Promise<RateMap>>();

async function fetchAndCache(pair: string, dates: string[]): Promise<RateMap> {
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

    const dates = datesParam ? datesParam.split(',') : [];

    const cached = await getCachedHistoricalFxRates(pair);

    // If we have any cache hit AND all requested dates are covered, serve cached.
    const allCovered = dates.length > 0 && dates.every(d => d in cached);
    if (allCovered || (dates.length === 0 && Object.keys(cached).length > 0)) {
        return NextResponse.json({ pair, rates: cached, source: 'cache' });
    }

    // Need a fresh fetch — coalesce concurrent requests.
    const key = `${pair}::${dates.join(',')}`;
    let promise = _inFlight.get(key);
    if (!promise) {
        promise = fetchAndCache(pair, dates);
        _inFlight.set(key, promise);
        promise.finally(() => _inFlight.delete(key));
    }

    try {
        const fresh = await promise;
        // Merge with anything already cached so caller gets the full picture.
        return NextResponse.json({ pair, rates: { ...cached, ...fresh }, source: 'fresh' });
    } catch (error) {
        return NextResponse.json({
            pair,
            rates: cached,
            source: 'error',
            error: error instanceof Error ? error.message : 'fetch failed',
        }, { status: cached && Object.keys(cached).length > 0 ? 200 : 502 });
    }
}
