import { NextResponse } from 'next/server';
import { getCachedTodayPrice, getLastKnownPrice, setCachedPrice } from '../../../lib/server/memoryStore';
import { fetchStockPrice } from '@portfolio/core';

const today = () => new Date().toISOString().split('T')[0];

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const fresh = searchParams.get('fresh') === '1';

    if (!symbol) {
        return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
    }

    // Unless caller asked for a fresh fetch, serve today's cached price if we have it.
    if (!fresh) {
        const cached = getCachedTodayPrice(symbol);
        if (cached !== null) {
            return NextResponse.json({ price: cached, date: today() });
        }
    }

    const price = await fetchStockPrice(symbol, true);
    if (price !== null) {
        setCachedPrice(symbol, price);
        return NextResponse.json({ price, date: today() });
    }

    // Yahoo rejected us (rate limit or transient). Serve the last known price
    // for this symbol if we have one — better than leaving the row stuck on
    // "Loading…" forever.
    const stale = getLastKnownPrice(symbol);
    if (stale !== null) {
        return NextResponse.json({ price: stale.price, date: stale.date, stale: true });
    }

    return NextResponse.json({ price: null, date: null });
}

export async function POST(request: Request) {
    const body = await request.json();
    const { symbol, price } = body;

    if (!symbol || typeof price !== 'number') {
        return NextResponse.json({ error: 'Symbol and price are required' }, { status: 400 });
    }

    setCachedPrice(symbol, price);
    return NextResponse.json({ success: true });
}
