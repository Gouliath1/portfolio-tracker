import { NextRequest, NextResponse } from 'next/server';
import { getFxRate, storeFxRate } from '@portfolio/server';
import { promises as fs } from 'fs';
import path from 'path';

const FX_RATES_FILE_PATH = path.join(process.cwd(), 'data/fxRates.json');

export async function GET(request: NextRequest) {
    try {
        const url = new URL(request.url);
        const fxPair = url.searchParams.get('pair');
        const requestedDate = url.searchParams.get('date');
        
        console.log(`🔍 FX RATE API CALL: pair=${fxPair}, date=${requestedDate || 'CURRENT'}`);
        console.log(`📊 Full URL: ${request.url}`);
        
        if (!fxPair) {
            return NextResponse.json({ error: 'FX pair parameter is required' }, { status: 400 });
        }
        
        // Try to get FX rate from database first
        let result = await getFxRate(fxPair, requestedDate || undefined);
        
        if (!result || result.rate === null) {
            // No data in database, try to get from JSON file and cache it
            console.log(`📄 No FX rate for ${fxPair} in database, checking JSON file...`);
            try {
                const data = await fs.readFile(FX_RATES_FILE_PATH, 'utf-8');
                const fxRatesData = JSON.parse(data);
                
                if (fxRatesData[fxPair]) {
                    // Cache all rates for this pair to database
                    console.log(`💾 Caching ${fxPair} rates to database...`);
                    const { migrateFxRatesFromJson } = await import('@portfolio/server');
                    const pairData = { [fxPair]: fxRatesData[fxPair] };
                    await migrateFxRatesFromJson(pairData);
                    
                    // Try to get the rate again from database
                    result = await getFxRate(fxPair, requestedDate || undefined);
                }
            } catch (error) {
                console.log(`ℹ️ No JSON file or error reading it: ${error}`);
            }
        }
        
        if (!result || result.rate === null) {
            console.log(`❌ No FX rate found in database for ${fxPair} on ${requestedDate || 'current'}`);
            return NextResponse.json({ rate: null, pair: fxPair });
        }

        console.log(`✅ FX rate found: ${fxPair} = ${result.rate} (date: ${result.date})`);
        return NextResponse.json(result);    } catch (error) {
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
        
        // Store the FX rate in database
        const today = new Date().toISOString().split('T')[0];
        await storeFxRate(fxPair, rate, today);
        
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
