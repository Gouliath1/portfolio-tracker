import { NextResponse } from 'next/server';
import { RawPosition } from '@portfolio/types';
import { calculatePortfolioSummary } from '@portfolio/core';

async function readPositionsFromDatabase(): Promise<RawPosition[]> {
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
        console.error('❌ Error reading positions from database:', error);
        return [];
    }
}

export async function GET(request: Request) {
    try {
        console.log('💰 GET /api/pnl - Calculating profit and loss');
        
        // Parse URL to check for refresh parameter
        const url = new URL(request.url);
        const forceRefresh = url.searchParams.get('refresh') === 'true';
        
        if (forceRefresh) {
            console.log('🔄 Force refresh requested for PnL calculation');
        }
        
        // Read positions data
        const positionsData = await readPositionsFromDatabase();
        
        // Convert any numeric tickers to strings and ensure proper typing
        const rawPositions: RawPosition[] = positionsData.map((pos: RawPosition) => ({
            ...pos,
            ticker: pos.ticker.toString()
        }));
        
        if (rawPositions.length === 0) {
            console.log('⚠️ No positions found');
            return NextResponse.json({
                success: true,
                summary: {
                    totalValueJPY: 0,
                    totalCostJPY: 0,
                    totalPnlJPY: 0,
                    totalPnlPercentage: 0
                },
                positions: [],
                count: 0
            });
        }
        
        // Calculate portfolio summary with current prices
        const portfolioSummary = await calculatePortfolioSummary(rawPositions, forceRefresh);
        
        // Extract PnL-focused data
        const pnlData = {
            summary: {
                totalValueJPY: portfolioSummary.totalValueJPY,
                totalCostJPY: portfolioSummary.totalCostJPY,
                totalPnlJPY: portfolioSummary.totalPnlJPY,
                totalPnlPercentage: portfolioSummary.totalPnlPercentage
            },
            positions: portfolioSummary.positions.map(pos => ({
                ticker: pos.ticker,
                fullName: pos.fullName,
                account: pos.account,
                quantity: pos.quantity,
                costPerUnit: pos.costPerUnit,
                currentPrice: pos.currentPrice,
                costInJPY: pos.costInJPY,
                currentValueJPY: pos.currentValueJPY,
                pnlJPY: pos.pnlJPY,
                pnlPercentage: pos.pnlPercentage,
                transactionCcy: pos.transactionCcy
            })),
            count: portfolioSummary.positions.length,
            timestamp: new Date().toISOString()
        };
        
        console.log(`✅ PnL calculated for ${pnlData.count} positions. Total P&L: ¥${pnlData.summary.totalPnlJPY.toLocaleString()} (${pnlData.summary.totalPnlPercentage.toFixed(2)}%)`);
        
        return NextResponse.json({
            success: true,
            ...pnlData
        });
        
    } catch (error) {
        console.error('❌ Error calculating PnL:', error);
        return NextResponse.json(
            { 
                success: false, 
                error: 'Failed to calculate profit and loss',
                details: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
}
