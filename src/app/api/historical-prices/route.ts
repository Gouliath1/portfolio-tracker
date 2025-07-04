import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { refreshAllHistoricalData, refreshFxRatesForDates } from '@/utils/yahooFinanceApi';

const POSITIONS_FILE_PATH = path.join(process.cwd(), 'src/data/positions.json');
const PRICES_FILE_PATH = path.join(process.cwd(), 'src/data/positionsPrices.json');
const FX_RATES_FILE_PATH = path.join(process.cwd(), 'src/data/fxRates.json');
const POSITIONS_TEMPLATE_PATH = path.join(process.cwd(), 'src/data/positions.template.json');

export async function POST(request: NextRequest) {
    try {
        console.log('🔄 Historical price refresh initiated...');
        
        // Load positions data
        let positionsData;
        try {
            const data = await fs.readFile(POSITIONS_FILE_PATH, 'utf-8');
            positionsData = JSON.parse(data);
        } catch (error) {
            console.log('positions.json not found, using template data');
            const data = await fs.readFile(POSITIONS_TEMPLATE_PATH, 'utf-8');
            positionsData = JSON.parse(data);
        }
        
        if (!positionsData.positions || !Array.isArray(positionsData.positions)) {
            return NextResponse.json({ error: 'Invalid positions data structure' }, { status: 400 });
        }
        
        // Refresh historical data for all positions
        const historicalResults = await refreshAllHistoricalData(positionsData.positions);
        
        // Load existing price data to preserve current prices
        let existingPrices: {[symbol: string]: {[date: string]: number}} = {};
        try {
            const existingData = await fs.readFile(PRICES_FILE_PATH, 'utf-8');
            existingPrices = JSON.parse(existingData);
        } catch (error) {
            console.log('No existing prices file found, creating new one');
        }
        
        // Merge historical data with existing data
        const updatedPrices: {[symbol: string]: {[date: string]: number}} = { ...existingPrices };
        
        for (const [symbol, historicalData] of Object.entries(historicalResults)) {
            if (historicalData) {
                updatedPrices[symbol] = historicalData;
                console.log(`✅ Updated historical data for ${symbol}: ${Object.keys(historicalData).length} data points`);
            } else {
                console.log(`❌ Failed to get historical data for ${symbol}`);
            }
        }
        
        // Sort dates for each symbol (newest first)
        for (const symbol of Object.keys(updatedPrices)) {
            if (updatedPrices[symbol] && typeof updatedPrices[symbol] === 'object') {
                const sortedDates = Object.keys(updatedPrices[symbol]).sort((a, b) => b.localeCompare(a));
                const sortedPrices: {[date: string]: number} = {};
                sortedDates.forEach(date => {
                    sortedPrices[date] = updatedPrices[symbol][date];
                });
                updatedPrices[symbol] = sortedPrices;
            }
        }
        
        // Write updated prices to file
        await fs.writeFile(PRICES_FILE_PATH, JSON.stringify(updatedPrices, null, 2));
        
        // Refresh FX rates for all available dates
        console.log('💱 Starting FX rates refresh...');
        const fxResults = await refreshFxRatesForDates(updatedPrices, positionsData.positions);
        
        // Load existing FX rates data
        let existingFxRates: {[fxPair: string]: {[date: string]: number}} = {};
        try {
            const existingFxData = await fs.readFile(FX_RATES_FILE_PATH, 'utf-8');
            existingFxRates = JSON.parse(existingFxData);
        } catch (error) {
            console.log('No existing FX rates file found, creating new one');
        }
        
        // Merge FX data with existing data
        const updatedFxRates: {[fxPair: string]: {[date: string]: number}} = { ...existingFxRates };
        
        for (const [fxPair, fxData] of Object.entries(fxResults)) {
            if (fxData) {
                updatedFxRates[fxPair] = fxData;
                console.log(`✅ Updated FX rates for ${fxPair}: ${Object.keys(fxData).length} data points`);
            } else {
                console.log(`❌ Failed to get FX rates for ${fxPair}`);
            }
        }
        
        // Sort dates for each FX pair (newest first)
        for (const fxPair of Object.keys(updatedFxRates)) {
            if (updatedFxRates[fxPair] && typeof updatedFxRates[fxPair] === 'object') {
                const sortedDates = Object.keys(updatedFxRates[fxPair]).sort((a, b) => b.localeCompare(a));
                const sortedRates: {[date: string]: number} = {};
                sortedDates.forEach(date => {
                    sortedRates[date] = updatedFxRates[fxPair][date];
                });
                updatedFxRates[fxPair] = sortedRates;
            }
        }
        
        // Write updated FX rates to file
        await fs.writeFile(FX_RATES_FILE_PATH, JSON.stringify(updatedFxRates, null, 2));
        
        const successfulUpdates = Object.entries(historicalResults).filter(([_, data]) => data !== null).length;
        const failedUpdates = Object.entries(historicalResults).filter(([_, data]) => data === null).length;
        
        const successfulFxUpdates = Object.entries(fxResults).filter(([_, data]) => data !== null).length;
        const failedFxUpdates = Object.entries(fxResults).filter(([_, data]) => data === null).length;
        
        console.log(`🏁 Historical refresh completed: ${successfulUpdates} successful, ${failedUpdates} failed`);
        console.log(`🏁 FX rates refresh completed: ${successfulFxUpdates} successful, ${failedFxUpdates} failed`);
        
        return NextResponse.json({
            success: true,
            message: `Historical data refreshed for ${successfulUpdates} symbols and ${successfulFxUpdates} FX pairs`,
            results: {
                prices: {
                    successful: successfulUpdates,
                    failed: failedUpdates,
                    symbols: Object.keys(historicalResults)
                },
                fxRates: {
                    successful: successfulFxUpdates,
                    failed: failedFxUpdates,
                    pairs: Object.keys(fxResults)
                }
            }
        });
        
    } catch (error) {
        console.error('Error refreshing historical prices:', error);
        return NextResponse.json(
            { error: 'Failed to refresh historical prices', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

export async function GET() {
    // Return current historical prices data
    try {
        const data = await fs.readFile(PRICES_FILE_PATH, 'utf-8');
        const prices = JSON.parse(data);
        return NextResponse.json({ prices });
    } catch (error) {
        return NextResponse.json({ 
            error: 'Historical prices file not found',
            message: 'Use POST to refresh historical data first'
        }, { status: 404 });
    }
}