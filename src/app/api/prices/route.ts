import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

const CACHE_FILE_PATH = path.join(process.cwd(), 'src/data/dailyPrices.json');

interface DailyPricesCache {
    lastUpdated: string;
    prices: {
        [symbol: string]: number;
    };
}

async function readPriceCache(): Promise<DailyPricesCache> {
    try {
        const data = await fs.readFile(CACHE_FILE_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        return { lastUpdated: '', prices: {} };
    }
}

async function writePriceCache(cache: DailyPricesCache): Promise<void> {
    await fs.writeFile(CACHE_FILE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
}

function isCacheValid(lastUpdated: string): boolean {
    if (!lastUpdated) return false;
    
    const today = new Date().toISOString().split('T')[0];
    return lastUpdated === today;
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    
    if (!symbol) {
        return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
    }

    const cache = await readPriceCache();
    const cacheIsValid = isCacheValid(cache.lastUpdated);
    const hasSymbolInCache = symbol in cache.prices;
    
    if (!cacheIsValid) {
        return NextResponse.json({ price: null });
    }

    if (hasSymbolInCache) {
        return NextResponse.json({ price: cache.prices[symbol] });
    } else {
        return NextResponse.json({ price: null });
    }
}

export async function POST(request: Request) {
    const body = await request.json();
    const { symbol, price } = body;
    
    if (!symbol || typeof price !== 'number') {
        return NextResponse.json({ error: 'Symbol and price are required' }, { status: 400 });
    }
    
    const cache = await readPriceCache();
    const today = new Date().toISOString().split('T')[0];
    
    if (cache.lastUpdated !== today) {
        cache.prices = {};
    }
    
    cache.lastUpdated = today;
    cache.prices[symbol] = price;
    
    await writePriceCache(cache);
    
    return NextResponse.json({ success: true });
}
