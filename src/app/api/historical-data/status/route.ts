import { NextResponse } from 'next/server';

// Historical data is fetched lazily client-side via the Yahoo Finance proxy.
export async function GET() {
    return NextResponse.json({
        needsRefresh: false,
        missingDays: 0,
        lastDataDate: null,
        reason: 'Historical data fetched on demand',
    });
}
