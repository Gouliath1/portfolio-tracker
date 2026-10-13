/**
 * Per-symbol screener data. The two-tier sourcing and the freshness policy
 * live in `screenerRefresh` (shared with the batch route). `cachedOnly=1`
 * restores from DB with no upstream calls (page load); `fresh=1` forces a
 * refetch of both tiers, but is honoured at most once per symbol per cooldown
 * so repeated or concurrent forced refreshes by many users collapse into one.
 */

import { NextResponse } from 'next/server';
import { getCachedFundamentals, setCachedFundamentalsBatch } from '../../../../lib/server/marketDataDb';
import { refreshSymbol } from '../../../../lib/server/screenerRefresh';
import {
    isValidSymbol, badRequest, cdnCache, NO_STORE, allowForcedRefresh,
    expensiveRoutesDisabled, disabledResponse, overLimit, clientIp,
} from '../../../../lib/server/requestGuards';

const FORCE_COOLDOWN_MS = 5 * 60_000;

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const wantsFresh = searchParams.get('fresh') === '1';
    const cachedOnly = searchParams.get('cachedOnly') === '1';
    // tier=price → fetch only the no-auth price tier (skip the crumb-gated ratios).
    const priceOnly = searchParams.get('tier') === 'price';

    if (!symbol) return badRequest('symbol is required');
    if (!isValidSymbol(symbol)) return badRequest('Invalid symbol');
    if (overLimit(`sq:${clientIp(request)}`, 120, 60_000)) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '30' } });
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
            { headers: cdnCache(300, 3600) },
        );
    }

    if (expensiveRoutesDisabled()) {
        if (!cached) return disabledResponse();
        return NextResponse.json({
            ...cached.data, source: 'cache', ratiosPending: cached.ratiosFetchedAt == null,
            fetchedAt: cached.fetchedAt, ratiosFetchedAt: cached.ratiosFetchedAt,
        }, { headers: NO_STORE });
    }

    const forceFresh = wantsFresh && allowForcedRefresh(`screener:${symbol}`, FORCE_COOLDOWN_MS);
    const outcome = await refreshSymbol(symbol, cached, { forceFresh, priceOnly });
    if (outcome.write) await setCachedFundamentalsBatch([outcome.write]);

    if (outcome.failed) {
        return NextResponse.json({ error: outcome.ratiosError ?? 'fetch failed', symbol }, { status: 502 });
    }

    return NextResponse.json(
        {
            ...outcome.result,
            source: outcome.source,
            ratiosPending: outcome.ratiosPending,
            fetchedAt: outcome.fetchedAt,
            ratiosFetchedAt: outcome.ratiosFetchedAt,
            ...(outcome.ratiosError ? { ratiosError: outcome.ratiosError } : {}),
        },
        { headers: forceFresh ? NO_STORE : cdnCache(300, 3600) },
    );
}
