import { NextResponse } from 'next/server';
import { getCachedTodayPrice, setCachedPrice } from '../../../lib/server/memoryStore';
import { fetchStockPrice } from '@portfolio/core';

const today = () => new Date().toISOString().split('T')[0];

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');

    if (!symbol) {
        return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
    }

    const cached = getCachedTodayPrice(symbol);
    if (cached !== null) {
        return NextResponse.json({ price: cached, date: today() });
    }

    const price = await fetchStockPrice(symbol, true);
    if (price !== null) setCachedPrice(symbol, price);

    return NextResponse.json({ price, date: price !== null ? today() : null });
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
