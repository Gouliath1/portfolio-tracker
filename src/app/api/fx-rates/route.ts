import { NextRequest, NextResponse } from 'next/server';
import { getCachedFxRate, setCachedFxRate } from '../../../lib/server/memoryStore';
import { getCachedFxRateOnOrBefore } from '../../../lib/server/marketDataDb';
import { fetchCurrentFxRate } from '@portfolio/core';
import {
    isValidPair, badRequest, cdnCache, NO_STORE, allowForcedRefresh,
    expensiveRoutesDisabled, disabledResponse,
} from '../../../lib/server/requestGuards';

const today = () => new Date().toISOString().split('T')[0];

export async function GET(request: NextRequest) {
    const url = new URL(request.url);
    const fxPair = url.searchParams.get('pair');
    const requestedDate = url.searchParams.get('date') ?? today();
    // A forced refresh is honoured once per pair per minute; other callers read its result.
    const fresh = url.searchParams.get('fresh') === '1'
        && !expensiveRoutesDisabled()
        && allowForcedRefresh(`fx:${(fxPair ?? '').toUpperCase()}`, 60_000);
    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

    if (!fxPair) {
        return NextResponse.json({ error: 'FX pair parameter is required' }, { status: 400 });
    }
    if (!isValidPair(fxPair.trim()) || !DATE_RE.test(requestedDate)) return badRequest('Invalid pair or date');

    const pair = fxPair.trim().toUpperCase();
    const headers = fresh ? NO_STORE : cdnCache(300, 1800);

    // Unless caller asked for a fresh fetch, serve today's cached rate.
    if (!fresh) {
        const cached = getCachedFxRate(pair, requestedDate);
        if (cached !== null) {
            return NextResponse.json({ pair, rate: cached, date: requestedDate, source: 'memory' }, { headers });
        }

        // Persistent SQLite cache with forward-fill — covers reloads after a
        // server restart (in-memory is empty but yesterday's close is on disk).
        // Yahoo doesn't have today's close until end-of-day anyway, so the
        // previous business day's rate is the right "current" value.
        const persistent = await getCachedFxRateOnOrBefore(pair, requestedDate);
        if (persistent !== null) {
            setCachedFxRate(pair, persistent, requestedDate);
            return NextResponse.json({ pair, rate: persistent, date: requestedDate, source: 'db' }, { headers });
        }
    }

    // Fetch live rates for today.
    if (requestedDate === today()) {
        if (expensiveRoutesDisabled()) return disabledResponse();
        const rate = await fetchCurrentFxRate(pair, true);
        if (rate !== null) {
            setCachedFxRate(pair, rate, requestedDate);
            return NextResponse.json({ pair, rate, date: requestedDate, source: 'fresh' }, { headers });
        }
    }

    // Historical date — check SQLite cache with forward-fill for non-trading days.
    const persistent = await getCachedFxRateOnOrBefore(pair, requestedDate);
    if (persistent !== null) {
        return NextResponse.json({ pair, rate: persistent, date: requestedDate, source: 'db' }, { headers });
    }

    return NextResponse.json({ pair, rate: null, date: requestedDate }, { headers: NO_STORE });
}
