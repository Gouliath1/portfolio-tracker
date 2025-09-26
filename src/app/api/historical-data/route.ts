import { NextResponse } from 'next/server';
import { refreshAllHistoricalData } from '@/utils/yahooFinanceApi';

async function getPositionsFromDatabase() {
    try {
        const { getDbClient } = await import('@portfolio/server');
        const client = getDbClient();
        
        // Get all positions from database
        const result = await client.execute(`
            SELECT 
                s.ticker,
                p.quantity,
                p.average_cost as costPerUnit,
                p.position_currency as transactionCcy,
                p.transaction_date as transactionDate
            FROM positions p
            JOIN securities s ON p.security_id = s.id
            ORDER BY p.transaction_date
        `);
        
        return result.rows.map(row => ({
            ticker: String(row.ticker),
            quantity: Number(row.quantity),
            costPerUnit: Number(row.costPerUnit),
            transactionCcy: String(row.transactionCcy),
            transactionDate: String(row.transactionDate) // Already in correct format from database
        }));
        
    } catch (error) {
        console.error('❌ Error loading positions from database:', error);
        throw error;
    }
}

export async function POST() {
    try {
        console.log('🔄 Historical data refresh initiated...');
        
        // Load positions from database
        const positions = await getPositionsFromDatabase();
        
        if (positions.length === 0) {
            return NextResponse.json({ 
                error: 'No positions found in database. Please import positions first.' 
            }, { status: 400 });
        }
        
        console.log(`📋 Found ${positions.length} positions in database`);
        
        // Refresh historical data for all positions
        const historicalResults = await refreshAllHistoricalData(positions);
        
        // Also refresh FX rates for the same dates
        const { refreshFxRatesForDates } = await import('@/utils/yahooFinanceApi');
        console.log('💱 Starting FX rates refresh for historical dates...');
        
        // Filter out null values for FX rate refresh
        const validHistoricalResults: {[symbol: string]: {[date: string]: number}} = {};
        for (const [symbol, data] of Object.entries(historicalResults)) {
            if (data !== null) {
                validHistoricalResults[symbol] = data;
            }
        }
        
        const fxResults = await refreshFxRatesForDates(validHistoricalResults, positions);
        console.log('💱 FX rates refresh completed');
        
        return NextResponse.json({ 
            message: 'Historical data refresh completed',
            historicalResults,
            fxResults,
            positionsProcessed: positions.length
        });
        
    } catch (error) {
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
        
        const { getDbClient } = await import('@portfolio/server');
        const client = getDbClient();
        
        // Get summary of historical data
        const pricesCount = await client.execute('SELECT COUNT(*) as count FROM securities_prices');
        const fxCount = await client.execute('SELECT COUNT(*) as count FROM fx_rates');
        const securitiesCount = await client.execute('SELECT COUNT(DISTINCT security_id) as count FROM securities_prices');
        
        // Get the most recent data date
        const recentPriceResult = await client.execute(`
            SELECT MAX(price_date) as latest_date 
            FROM securities_prices
        `);
        const lastDataDate = recentPriceResult.rows[0]?.latest_date as string | null;
        
        // Calculate days since last data
        let daysSinceLastData = 0;
        if (lastDataDate) {
            const lastDate = new Date(lastDataDate);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            lastDate.setHours(0, 0, 0, 0);
            daysSinceLastData = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
        }
        
        return NextResponse.json({
            historicalPrices: Number(pricesCount.rows[0].count),
            fxRates: Number(fxCount.rows[0].count),
            securitiesWithData: Number(securitiesCount.rows[0].count),
            lastDataDate,
            daysSinceLastData
        });
        
    } catch (error) {
        console.error('❌ Error fetching historical data summary:', error);
        return NextResponse.json(
            { error: 'Failed to fetch historical data summary' },
            { status: 500 }
        );
    }
}
