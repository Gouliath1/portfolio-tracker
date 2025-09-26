import { NextResponse } from 'next/server';
import { getActivePortfolioSnapshot } from '@portfolio/server';

export async function GET(request: Request) {
    try {
        console.log('💰 GET /api/pnl - Calculating profit and loss');
        
        // Parse URL to check for refresh parameter
        const url = new URL(request.url);
        const forceRefresh = url.searchParams.get('refresh') === 'true';
        
        if (forceRefresh) {
            console.log('🔄 Force refresh requested for PnL calculation');
        }
        
        const snapshot = await getActivePortfolioSnapshot({ forceRefresh });

        const count = snapshot.summary.positions.length;

        console.log(`✅ PnL calculated for ${count} positions. Total P&L: ¥${snapshot.summary.totalPnlJPY.toLocaleString()} (${snapshot.summary.totalPnlPercentage.toFixed(2)}%)`);

        return NextResponse.json({
            success: true,
            summary: {
                totalValueJPY: snapshot.summary.totalValueJPY,
                totalCostJPY: snapshot.summary.totalCostJPY,
                totalPnlJPY: snapshot.summary.totalPnlJPY,
                totalPnlPercentage: snapshot.summary.totalPnlPercentage
            },
            positions: snapshot.summary.positions.map(pos => ({
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
            count,
            timestamp: snapshot.timestamp
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
