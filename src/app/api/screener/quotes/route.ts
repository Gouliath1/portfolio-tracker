/**
 * Batch cache-only lookup for screener fundamentals.
 * GET /api/screener/quotes?symbols=A,B,C
 * Returns only symbols present in the DB — missing symbols are omitted.
 * One SQL round-trip replaces N individual /api/screener/quote?cachedOnly=1 calls.
 */
import { NextResponse } from 'next/server';
import { getCachedFundamentalsBatch } from '../../../../lib/server/marketDataDb';

const CACHE_HEADERS = { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' };

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const raw = searchParams.get('symbols') ?? '';
    const symbols = raw.split(',').map(s => s.trim()).filter(Boolean).slice(0, 300);

    if (symbols.length === 0) {
        return NextResponse.json({}, { headers: CACHE_HEADERS });
    }

    const batch = await getCachedFundamentalsBatch(symbols);

    const result: Record<string, unknown> = {};
    for (const [symbol, cached] of batch.entries()) {
        result[symbol] = {
            ...cached.data,
            source: 'cache',
            ratiosPending: cached.data.trailingPE == null,
            fetchedAt: cached.fetchedAt,
            ratiosFetchedAt: cached.ratiosFetchedAt,
        };
    }

    return NextResponse.json(result, { headers: CACHE_HEADERS });
}
