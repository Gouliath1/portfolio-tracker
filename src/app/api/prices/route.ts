import { NextResponse } from 'next/server';
import { 
  storePriceData,
  getTodaysPrice as getDbTodaysPrice
} from '@portfolio/server';
import { fetchStockPrice } from '@portfolio/core';

async function getTodaysPrice(symbol: string): Promise<number | null> {
    return await getDbTodaysPrice(symbol);
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    
    if (!symbol) {
        return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
    }

    try {
        // First try to get today's cached price from database
        const cachedPrice = await getTodaysPrice(symbol);
        
        if (cachedPrice !== null) {
            console.log(`📋 Using cached price for ${symbol}: $${cachedPrice}`);
            return NextResponse.json({ price: cachedPrice });
        }

        // If no cached price, fetch from Yahoo Finance
        console.log(`🌐 Fetching fresh price for ${symbol} from Yahoo Finance`);
        const freshPrice = await fetchStockPrice(symbol, true); // Force refresh
        
        if (freshPrice !== null) {
            // Store the fresh price in database
            const today = new Date().toISOString().split('T')[0];
            await storePriceData(symbol, today, freshPrice);
            
            console.log(`✅ Fetched and cached price for ${symbol}: $${freshPrice}`);
            return NextResponse.json({ price: freshPrice });
        } else {
            console.warn(`❌ Unable to fetch price for ${symbol}`);
            return NextResponse.json({ price: null });
        }

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
        const today = new Date().toISOString().split('T')[0];
        await storePriceData(symbol, today, price);
        
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
