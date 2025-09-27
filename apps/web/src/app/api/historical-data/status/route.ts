import { NextResponse } from 'next/server';
import { getHistoricalDataStatus } from '@portfolio/server';

export async function GET() {
  try {
    console.log('🔍 GET /api/historical-data/status - Checking historical data status');
    const status = await getHistoricalDataStatus();

    return NextResponse.json({
      ...status,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error checking historical data status:', error);
    return NextResponse.json(
      { error: 'Failed to check historical data status' },
      { status: 500 }
    );
  }
}
