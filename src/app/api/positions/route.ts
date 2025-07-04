import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { RawPosition } from '@/types/portfolio';

const POSITIONS_FILE_PATH = path.join(process.cwd(), 'src/data/positions.json');
const POSITIONS_TEMPLATE_PATH = path.join(process.cwd(), 'src/data/positions.template.json');

async function readPositionsData() {
    try {
        // Try to read the local positions.json file first
        const data = await fs.readFile(POSITIONS_FILE_PATH, 'utf-8');
        const positions = JSON.parse(data);
        console.log('📋 Using local positions data');
        return positions;
    } catch {
        try {
            // Fallback to template if positions.json doesn't exist
            const data = await fs.readFile(POSITIONS_TEMPLATE_PATH, 'utf-8');
            const positions = JSON.parse(data);
            console.log('📋 Using template positions data. Create a positions.json file based on positions.template.json to use your own data.');
            return positions;
        } catch (error) {
            console.error('❌ Error reading positions data:', error);
            return { positions: [] };
        }
    }
}

export async function GET() {
    try {
        console.log('📋 GET /api/positions - Fetching positions data');
        
        const positionsData = await readPositionsData();
        
        // Convert any numeric tickers to strings and ensure proper typing
        const processedPositions: RawPosition[] = positionsData.positions.map((pos: RawPosition) => ({
            ...pos,
            ticker: pos.ticker.toString()
        }));
        
        console.log(`✅ Successfully fetched ${processedPositions.length} positions`);
        
        return NextResponse.json({ 
            success: true,
            positions: processedPositions,
            count: processedPositions.length
        });
    } catch (error) {
        console.error('❌ Error in positions API:', error);
        return NextResponse.json({ 
            success: false,
            error: 'Failed to load positions data',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
