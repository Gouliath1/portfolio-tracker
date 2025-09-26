import { NextResponse } from 'next/server';
import { NoPositionsAvailableError, getHistoricalDataSummary, refreshHistoricalDataForActivePortfolio } from '@portfolio/server';

export async function POST() {
    try {
        console.log('🔄 Historical data refresh initiated...');
        
        const result = await refreshHistoricalDataForActivePortfolio();

        console.log(`📋 Historical refresh processed ${result.positionsProcessed} positions`);

        return NextResponse.json({ 
            message: 'Historical data refresh completed',
            historicalResults: result.historicalResults,
            fxResults: result.fxResults,
            positionsProcessed: result.positionsProcessed
        });
        
    } catch (error) {
        if (error instanceof NoPositionsAvailableError) {
            return NextResponse.json({
                error: 'No positions found in database. Please import positions first.'
            }, { status: 400 });
        }
        console.error('❌ Error in historical price refresh:', error);
        return NextResponse.json(
            { error: 'Failed to refresh historical data' },
            { status: 500 }
        );
    }
}

export async function GET() {
    try {
        console.log('📊 GET /api/historical-data - Fetching historical data summary');
        
        const summary = await getHistoricalDataSummary();
        
        return NextResponse.json(summary);
        
    } catch (error) {
        console.error('❌ Error fetching historical data summary:', error);
        return NextResponse.json(
            { error: 'Failed to fetch historical data summary' },
            { status: 500 }
        );
    }
}
