import { NextRequest, NextResponse } from 'next/server';
import { getCachedFxRate, setCachedFxRate } from '../../../lib/server/memoryStore';
import { getCachedFxRateOnOrBefore } from '../../../lib/server/marketDataDb';
import { fetchCurrentFxRate } from '@portfolio/core';

const today = () => new Date().toISOString().split('T')[0];

export async function GET(request: NextRequest) {
    const url = new URL(request.url);
    const fxPair = url.searchParams.get('pair');
    const requestedDate = url.searchParams.get('date') ?? today();
    const fresh = url.searchParams.get('fresh') === '1';

    if (!fxPair) {
        return NextResponse.json({ error: 'FX pair parameter is required' }, { status: 400 });
    }

    const pair = fxPair.trim().toUpperCase();

    // Unless caller asked for a fresh fetch, serve today's cached rate.
    if (!fresh) {
        const cached = getCachedFxRate(pair, requestedDate);
        if (cached !== null) {
            return NextResponse.json({ pair, rate: cached, date: requestedDate, source: 'memory' });
        }
    }

    // Fetch live rates for today.
    if (requestedDate === today()) {
        const rate = await fetchCurrentFxRate(pair, true);
        if (rate !== null) {
            setCachedFxRate(pair, rate, requestedDate);
            return NextResponse.json({ pair, rate, date: requestedDate, source: 'fresh' });
        }
    }

    // Historical date — check SQLite cache with forward-fill for non-trading days.
    const persistent = await getCachedFxRateOnOrBefore(pair, requestedDate);
    if (persistent !== null) {
        return NextResponse.json({ pair, rate: persistent, date: requestedDate, source: 'db' });
    }

    return NextResponse.json({ pair, rate: null, date: requestedDate });
}

export async function POST(request: NextRequest) {
    const { fxPair, rate, date } = await request.json();

    if (!fxPair || typeof rate !== 'number') {
        return NextResponse.json({ error: 'Invalid FX pair or rate' }, { status: 400 });
    }

    const storeDate = date ?? today();
    setCachedFxRate(fxPair.trim().toUpperCase(), rate, storeDate);

    return NextResponse.json({ success: true, message: `FX rate cached for ${fxPair}`, rate });
}
