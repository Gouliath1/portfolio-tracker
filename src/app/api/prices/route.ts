import { NextResponse } from 'next/server';
import { getLatestPriceForSymbol, storePriceForSymbol } from '@portfolio/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    
    if (!symbol) {
        return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
    }

    try {
        const result = await getLatestPriceForSymbol(symbol);

        if (result.price === null) {
            console.warn(`❌ Unable to fetch price for ${symbol}`);
            return NextResponse.json({ price: null });
        }

        if (result.source === 'database') {
            console.log(`📋 Using cached price for ${symbol}: $${result.price}`);
        } else {
            console.log(`✅ Fetched and cached price for ${symbol}: $${result.price}`);
        }

        return NextResponse.json({ price: result.price, date: result.date });

    } catch (error) {
        console.error(`❌ Error in price API for ${symbol}:`, error);
        return NextResponse.json(
            { error: 'Failed to fetch price data' }, 
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    const body = await request.json();
    const { symbol, price } = body;
    
    if (!symbol || typeof price !== 'number') {
        return NextResponse.json({ error: 'Symbol and price are required' }, { status: 400 });
    }

    try {
        // Store the price in database
        await storePriceForSymbol(symbol, price);

        console.log(`✅ Stored price for ${symbol}: $${price}`);
        return NextResponse.json({ success: true });

    } catch (error) {
        console.error(`❌ Error storing price for ${symbol}:`, error);
        return NextResponse.json(
            { error: 'Failed to store price data' }, 
            { status: 500 }
        );
    }
}
