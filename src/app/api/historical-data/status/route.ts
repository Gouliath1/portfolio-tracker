import { NextResponse } from 'next/server';
import { getDbClient } from '@portfolio/server';

interface HistoricalDataStatus {
    needsRefresh: boolean;
    missingDays: number;
    lastDataDate: string | null;
    reason: string;
}

/**
 * Server-side function to check if historical data needs to be refreshed
 */
async function checkHistoricalDataStatusFromDb(): Promise<HistoricalDataStatus> {
    try {
        const client = getDbClient();
        
        // Get the most recent historical price date
        const recentPriceResult = await client.execute(`
            SELECT MAX(price_date) as latest_date 
            FROM securities_prices
        `);
        
        const lastDataDate = recentPriceResult.rows[0]?.latest_date as string | null;
        
        if (!lastDataDate) {
            return {
                needsRefresh: true,
                missingDays: 0,
                lastDataDate: null,
                reason: 'No historical data found'
            };
        }
        
        // Calculate days between last data and today
        const lastDate = new Date(lastDataDate);
        const today = new Date();
        
        // Set today to start of day for comparison
        today.setHours(0, 0, 0, 0);
        lastDate.setHours(0, 0, 0, 0);
        
        const diffTime = today.getTime() - lastDate.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        // Consider weekends - if it's Monday and last data is Friday, that's normal
        const todayDayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
        const lastDateDayOfWeek = lastDate.getDay();
        
        let expectedMissingDays = 0;
        
        // If today is Monday (1) and last date was Friday (5), we expect 2 days gap
        if (todayDayOfWeek === 1 && lastDateDayOfWeek === 5) {
            expectedMissingDays = 2;
        }
        // If today is Tuesday (2) and last date was Friday (5), we expect 3 days gap  
        else if (todayDayOfWeek === 2 && lastDateDayOfWeek === 5) {
            expectedMissingDays = 3;
        }
        
        // If we're missing more than expected (accounting for weekends), refresh
        const unexpectedMissingDays = diffDays - expectedMissingDays;
        
        // Refresh if:
        // 1. More than 1 business day behind, OR
        // 2. It's a weekday and we're missing today's data
        const needsRefresh = unexpectedMissingDays > 1 || 
                           (todayDayOfWeek >= 1 && todayDayOfWeek <= 5 && diffDays > expectedMissingDays);
        
        let reason = '';
        if (needsRefresh) {
            if (diffDays === 0) {
                reason = 'Data is current';
            } else if (diffDays === expectedMissingDays) {
                reason = `Missing ${diffDays} days (expected due to weekends)`;
            } else {
                reason = `Missing ${diffDays} days (${unexpectedMissingDays} unexpected)`;
            }
        } else {
            reason = `Data is up to date (last: ${lastDataDate})`;
        }
        
        return {
            needsRefresh,
            missingDays: diffDays,
            lastDataDate,
            reason
        };
        
    } catch (error) {
        console.error('Error checking historical data status:', error);
        return {
            needsRefresh: true,
            missingDays: 0,
            lastDataDate: null,
            reason: 'Error checking data status'
        };
    }
}

export async function GET() {
    try {
        console.log('🔍 GET /api/historical-data/status - Checking historical data status');
        
        const status = await checkHistoricalDataStatusFromDb();
        
        return NextResponse.json({
            needsRefresh: status.needsRefresh,
            missingDays: status.missingDays,
            lastDataDate: status.lastDataDate,
            reason: status.reason,
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
