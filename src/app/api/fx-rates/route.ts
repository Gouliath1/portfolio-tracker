import { NextRequest, NextResponse } from 'next/server';
import { getFxRateWithFallback, updateFxRate } from '@portfolio/server';

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
        
        const result = await getFxRateWithFallback(fxPair, { date: requestedDate || undefined });

        if (result.rate === null) {
            console.log(`❌ No FX rate found in database for ${fxPair} on ${requestedDate || 'current'}`);
            return NextResponse.json({ rate: null, pair: fxPair });
        }

        console.log(`✅ FX rate found: ${fxPair} = ${result.rate} (date: ${result.date}) via ${result.source}`);
        return NextResponse.json(result);
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
        
        // Store the FX rate in database
        await updateFxRate(fxPair, rate);
        
        return NextResponse.json({ 
            success: true,
            message: `FX rate updated for ${fxPair}`,
            rate
        });
        
    } catch (error) {
        console.error('Error updating FX rate:', error);
        return NextResponse.json({ 
            error: 'Failed to update FX rate',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
