import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { RawPosition, Position } from '@/types/portfolio';
import { calculatePortfolioSummary } from '@/utils/calculations';

const POSITIONS_FILE_PATH = path.join(process.cwd(), 'src/data/positions.json');
const POSITIONS_TEMPLATE_PATH = path.join(process.cwd(), 'src/data/positions.template.json');

async function readPositionsData() {
    try {
        // Try to read the local positions.json file first
        const data = await fs.readFile(POSITIONS_FILE_PATH, 'utf-8');
        const positions = JSON.parse(data);
        console.log('💰 Using local positions data for PnL calculation');
        return positions;
    } catch {
        try {
            // Fallback to template if positions.json doesn't exist
            const data = await fs.readFile(POSITIONS_TEMPLATE_PATH, 'utf-8');
            const positions = JSON.parse(data);
            console.log('💰 Using template positions data for PnL calculation');
            return positions;
        } catch (error) {
            console.error('❌ Error reading positions data:', error);
            return { positions: [] };
        }
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
        const positionsData = await readPositionsData();
        
        // Convert any numeric tickers to strings and ensure proper typing
        const rawPositions: RawPosition[] = positionsData.positions.map((pos: any) => ({
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
                baseCcy: pos.baseCcy
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
