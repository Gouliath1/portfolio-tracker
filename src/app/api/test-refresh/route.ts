import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { calculatePortfolioSummary } from '../../../utils/calculations';
import { RawPosition } from '../../../types/portfolio';

async function loadPositionsFromFile(): Promise<RawPosition[]> {
    try {
        const filePath = path.join(process.cwd(), 'src/data/positions.json');
        const data = await fs.readFile(filePath, 'utf-8');
        const parsed = JSON.parse(data);
        return parsed.positions || [];
    } catch (error) {
        console.error('Error loading positions from file:', error);
        return [];
    }
}

async function savePricesToCache(prices: {[symbol: string]: number | null}): Promise<void> {
    try {
        const cacheFilePath = path.join(process.cwd(), 'src/data/positionsPrices.json');
        
        // Read current data
        let historicalData: {[symbol: string]: {[date: string]: number}} = {};
        try {
            const data = await fs.readFile(cacheFilePath, 'utf-8');
            historicalData = JSON.parse(data);
        } catch {
            // File doesn't exist or is invalid, start fresh
        }
        
        // Update today's prices for all symbols
        const today = new Date().toISOString().split('T')[0];
        for (const [symbol, price] of Object.entries(prices)) {
            if (price !== null) {
                if (!historicalData[symbol]) {
                    historicalData[symbol] = {};
                }
                historicalData[symbol][today] = price;
                console.log(`💾 Saved ${symbol}: ${price} to cache`);
            }
        }
        
        // Write back to file
        await fs.writeFile(cacheFilePath, JSON.stringify(historicalData, null, 2), 'utf-8');
        console.log(`💾 Cache file updated with ${Object.keys(prices).length} symbols`);
        
    } catch (error) {
        console.error('Error saving prices to cache:', error);
    }
}

export async function GET() {
    try {
        console.log('🔴 TEST FORCE REFRESH ENDPOINT CALLED');
        
        const currentPositions = await loadPositionsFromFile();
        console.log(`📊 Loaded ${currentPositions.length} positions`);
        
        // This should trigger exactly 10 Yahoo Finance API calls
        const summary = await calculatePortfolioSummary(currentPositions, true);
        
        // Extract the prices from the portfolio summary and save them to cache
        const pricesFromSummary: {[symbol: string]: number | null} = {};
        for (const position of summary.positions) {
            pricesFromSummary[position.ticker.toString()] = position.currentPrice;
        }
        
        // Save all the fresh prices to cache
        await savePricesToCache(pricesFromSummary);
        
        return NextResponse.json({ 
            success: true, 
            message: 'Force refresh completed',
            totalPositions: currentPositions.length,
            totalValue: summary.totalValueJPY,
            pricesUpdated: Object.keys(pricesFromSummary).length
        });
    } catch (error) {
        console.error('❌ Test refresh failed:', error);
        return NextResponse.json({ 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error' 
        }, { status: 500 });
    }
}
