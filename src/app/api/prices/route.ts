import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

const CACHE_FILE_PATH = path.join(process.cwd(), 'src/data/positionsPrices.json');

interface HistoricalPricesData {
    [symbol: string]: {
        [date: string]: number;
    };
}

async function readHistoricalPrices(): Promise<HistoricalPricesData> {
    try {
        const data = await fs.readFile(CACHE_FILE_PATH, 'utf-8');
        return JSON.parse(data);
    } catch {
        return {};
    }
}

async function writeHistoricalPrices(data: HistoricalPricesData): Promise<void> {
    // Sort each symbol's dates in descending order (newest to oldest)
    const sortedData: HistoricalPricesData = {};
    
    for (const [symbol, prices] of Object.entries(data)) {
        const sortedDates = Object.keys(prices).sort((a, b) => b.localeCompare(a));
        sortedData[symbol] = {};
        
        for (const date of sortedDates) {
            sortedData[symbol][date] = prices[date];
        }
    }
    
    await fs.writeFile(CACHE_FILE_PATH, JSON.stringify(sortedData, null, 2), 'utf-8');
}

function getTodaysPrice(data: HistoricalPricesData, symbol: string): number | null {
    const today = new Date().toISOString().split('T')[0];
    return data[symbol]?.[today] || null;
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    
    if (!symbol) {
        return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
    }

    const historicalData = await readHistoricalPrices();
    const todaysPrice = getTodaysPrice(historicalData, symbol);
    
    return NextResponse.json({ price: todaysPrice });
}

export async function POST(request: Request) {
    const body = await request.json();
    const { symbol, price } = body;
    
    if (!symbol || typeof price !== 'number') {
        return NextResponse.json({ error: 'Symbol and price are required' }, { status: 400 });
    }
    
    const historicalData = await readHistoricalPrices();
    const today = new Date().toISOString().split('T')[0];
    
    // Initialize symbol data if it doesn't exist
    if (!historicalData[symbol]) {
        historicalData[symbol] = {};
    }
    
    // Update only today's price for this symbol
    historicalData[symbol][today] = price;
    
    await writeHistoricalPrices(historicalData);
    
    return NextResponse.json({ success: true });
}
