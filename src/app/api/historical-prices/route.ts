/**
 * Server-side cached fetcher for historical stock prices.
 *
 * Layers, on cache miss:
 *   1. SQLite cache (data/marketCache.db locally, Turso in prod)
 *   2. Yahoo Finance (with retry + serialized rate limiting)
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

function inFlightKey(symbol: string, interval: string, range: string): string {
    return `${symbol}::${interval}::${range}`;
}

async function fetchAndCache(symbol: string, interval: '1d' | '1mo', range: string): Promise<PriceMap> {
    // The core fetcher takes positions to compute the date range; pass a single
    // synthetic position so it asks Yahoo for the right window.
    const synthetic = [{ transactionDate: rangeToStartDate(range), ticker: symbol }];
    const fetched = await fetchHistoricalPrices(symbol, synthetic, interval);
    if (fetched && Object.keys(fetched).length > 0) {
        await setCachedHistoricalPrices(symbol, fetched);
    }
    return fetched ?? {};
}

function rangeToStartDate(range: string): string {
    // Just used to nudge fetchHistoricalPrices towards the right window.
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

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const interval = (searchParams.get('interval') ?? '1mo') as '1d' | '1mo';
    const range = searchParams.get('range') ?? '5y';

    if (!symbol) {
        return NextResponse.json({ error: 'symbol is required' }, { status: 400 });
    }

    // Cache check first.
    const cached = await getCachedHistoricalPrices(symbol);
    if (Object.keys(cached).length > 0) {
        // We have something — return it. The client can decide whether to
        // request a refresh if it needs newer dates.
        return NextResponse.json({ symbol, prices: cached, source: 'cache' });
    }

    // Miss → coalesce concurrent fetches for the same window.
    const key = inFlightKey(symbol, interval, range);
    let promise = _inFlight.get(key);
    if (!promise) {
        promise = fetchAndCache(symbol, interval, range);
        _inFlight.set(key, promise);
        promise.finally(() => _inFlight.delete(key));
    }

    try {
        const prices = await promise;
        return NextResponse.json({ symbol, prices, source: 'fresh' });
    } catch (error) {
        return NextResponse.json({
            symbol,
            prices: {},
            source: 'error',
            error: error instanceof Error ? error.message : 'fetch failed',
        }, { status: 502 });
    }
}
