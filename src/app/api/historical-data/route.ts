import { NextResponse } from 'next/server';

// Historical data is fetched lazily client-side via the Yahoo Finance proxy.
// This endpoint is a no-op kept for API compatibility.
export async function POST() {
    return NextResponse.json({
        message: 'Historical data is fetched on demand by the client',
        positionsProcessed: 0,
        historicalResults: {},
        fxResults: {},
    });
}

export async function GET() {
    return NextResponse.json({
        historicalPrices: 0,
        fxRates: 0,
        securitiesWithData: 0,
        lastDataDate: null,
        daysSinceLastData: 0,
    });
}
