import { NextResponse } from 'next/server';
import { calculatePortfolioSummary } from '@portfolio/core';
import { RawPosition } from '@portfolio/types';

async function loadPositionsFromDatabase(): Promise<RawPosition[]> {
    try {
        const { getDbClient } = await import('@portfolio/server');
        const client = getDbClient();
        
        // Query positions with joined data
        const result = await client.execute(`
            SELECT 
                p.quantity,
                p.average_cost as costPerUnit,
                p.position_currency as transactionCcy,
                s.ticker,
                s.name as fullName,
                s.currency as stockCcy,
                a.name as account,
                b.display_name as broker
            FROM positions p
            JOIN securities s ON p.security_id = s.id
            JOIN accounts a ON p.account_id = a.id
            JOIN brokers b ON a.broker_id = b.id
            ORDER BY s.ticker
        `);
        
        return result.rows.map(row => ({
            transactionDate: '2023/01/01',
            ticker: String(row.ticker),
            fullName: String(row.fullName),
            broker: String(row.broker),
            account: String(row.account),
            quantity: Number(row.quantity),
            costPerUnit: Number(row.costPerUnit),
            transactionCcy: String(row.transactionCcy),
            stockCcy: String(row.stockCcy || row.transactionCcy)
        }));
    } catch (error) {
        console.error('Error loading positions from database:', error);
        return [];
    }
}

export async function POST() {
    try {
        console.log('🔄 Test refresh initiated...');
        
        const currentPositions = await loadPositionsFromDatabase();
        
        if (currentPositions.length === 0) {
            return NextResponse.json({
                error: 'No positions found in database'
            }, { status: 400 });
        }
        
        console.log(`📋 Found ${currentPositions.length} positions for refresh`);
        
        // Trigger portfolio calculation with force refresh
        const summary = await calculatePortfolioSummary(currentPositions, true);
        
        return NextResponse.json({ 
            message: 'Refresh completed successfully',
            positionsCount: currentPositions.length,
            totalValueJPY: summary.totalValueJPY,
            totalPnlJPY: summary.totalPnlJPY
        });
        
    } catch (error) {
        console.error('❌ Error in test refresh:', error);
        return NextResponse.json(
            { error: 'Failed to refresh data' },
            { status: 500 }
        );
    }
}
