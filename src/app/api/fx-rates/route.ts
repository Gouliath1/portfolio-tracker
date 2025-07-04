import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const FX_RATES_FILE_PATH = path.join(process.cwd(), 'src/data/fxRates.json');

interface FxRateData {
    [fxPair: string]: {
        [date: string]: number;
    };
}

export async function GET(request: NextRequest) {
    try {
        const url = new URL(request.url);
        const fxPair = url.searchParams.get('pair');
        
        if (!fxPair) {
            return NextResponse.json({ error: 'FX pair parameter is required' }, { status: 400 });
        }
        
        // Read FX rates data
        let fxRates: FxRateData = {};
        try {
            const data = await fs.readFile(FX_RATES_FILE_PATH, 'utf-8');
            fxRates = JSON.parse(data);
        } catch {
            // File doesn't exist, return null
            return NextResponse.json({ rate: null });
        }
        
        if (!fxRates[fxPair]) {
            return NextResponse.json({ rate: null });
        }
        
        // Get the most recent rate (first key since dates are sorted newest first)
        const dates = Object.keys(fxRates[fxPair]);
        if (dates.length === 0) {
            return NextResponse.json({ rate: null });
        }
        
        const latestDate = dates[0];
        const rate = fxRates[fxPair][latestDate];
        
        return NextResponse.json({ 
            rate,
            date: latestDate,
            pair: fxPair
        });
        
    } catch (error) {
        console.error('Error fetching FX rate:', error);
        return NextResponse.json({ 
            error: 'Failed to fetch FX rate',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const { fxPair, rate } = await request.json();
        
        if (!fxPair || typeof rate !== 'number') {
            return NextResponse.json({ error: 'Invalid FX pair or rate' }, { status: 400 });
        }
        
        // Read existing data
        let fxRates: FxRateData = {};
        try {
            const data = await fs.readFile(FX_RATES_FILE_PATH, 'utf-8');
            fxRates = JSON.parse(data);
        } catch {
            // File doesn't exist or is invalid, start fresh
        }
        
        // Initialize pair if it doesn't exist
        if (!fxRates[fxPair]) {
            fxRates[fxPair] = {};
        }
        
        // Add today's rate
        const today = new Date().toISOString().split('T')[0];
        fxRates[fxPair][today] = rate;
        
        // Sort dates for this pair (newest first)
        const sortedDates = Object.keys(fxRates[fxPair]).sort((a, b) => b.localeCompare(a));
        const sortedRates: {[date: string]: number} = {};
        sortedDates.forEach(date => {
            sortedRates[date] = fxRates[fxPair][date];
        });
        fxRates[fxPair] = sortedRates;
        
        // Write back to file
        await fs.writeFile(FX_RATES_FILE_PATH, JSON.stringify(fxRates, null, 2), 'utf-8');
        
        return NextResponse.json({ 
            success: true,
            message: `FX rate updated for ${fxPair}`,
            rate,
            date: today
        });
        
    } catch (error) {
        console.error('Error updating FX rate:', error);
        return NextResponse.json({ 
            error: 'Failed to update FX rate',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
