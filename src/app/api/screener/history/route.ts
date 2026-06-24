/**
 * On-the-fly price history for the screener chart modal.
 *
 * Routes through core's fetchHistoricalPrices, which already has the robust
 * machinery the bare chart fetch lacked: rate-limiting (withRateLimit),
 * retry-on-429/5xx, and a 5-minute in-memory dedupe cache. That fixes the 502s
 * from opening charts while the chart endpoint is busy. Server-side
 * fetchHistoricalPrices hits Yahoo directly and does NOT persist to SQLite, so
 * we still avoid bloating the cache with transient research tickers — we only
 * ever chart a handful at a time anyway.
 */

import { NextResponse } from 'next/server';
import { fetchHistoricalPrices } from '@portfolio/core';

const RANGE_MONTHS: Record<string, number> = { '6mo': 6, '1y': 12, '2y': 24, '5y': 60, 'max': 360 };

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const range = searchParams.get('range') ?? '1y';

    if (!symbol) {
        return NextResponse.json({ error: 'symbol is required' }, { status: 400 });
    }
    const months = RANGE_MONTHS[range];
    if (!months) {
        return NextResponse.json({ error: 'invalid range' }, { status: 400 });
    }

    // Daily resolution for short ranges, monthly for long ones (smaller payload).
    const interval = months <= 12 ? '1d' : '1mo';
    const start = new Date();
    start.setMonth(start.getMonth() - months);
    const synthetic = [{ transactionDate: start.toISOString().split('T')[0], ticker: symbol }];

    try {
        const map = await fetchHistoricalPrices(symbol, synthetic, interval);
        if (!map || Object.keys(map).length === 0) {
            return NextResponse.json({ error: 'no data', symbol }, { status: 502 });
        }
        const prices = Object.entries(map)
            .map(([date, close]) => ({ date, close }))
            .sort((a, b) => a.date.localeCompare(b.date));
        return NextResponse.json(
            { symbol, prices },
            { headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' } },
        );
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'fetch failed', symbol },
            { status: 502 },
        );
    }
}
