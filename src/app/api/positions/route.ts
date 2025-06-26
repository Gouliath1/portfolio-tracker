import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

const POSITIONS_FILE_PATH = path.join(process.cwd(), 'src/data/positions.json');
const POSITIONS_TEMPLATE_PATH = path.join(process.cwd(), 'src/data/positions.template.json');

async function readPositionsData() {
    try {
        // Try to read the local positions.json file first
        const data = await fs.readFile(POSITIONS_FILE_PATH, 'utf-8');
        const positions = JSON.parse(data);
        console.log('Using local positions data');
        return positions;
    } catch {
        try {
            // Fallback to template if positions.json doesn't exist
            const data = await fs.readFile(POSITIONS_TEMPLATE_PATH, 'utf-8');
            const positions = JSON.parse(data);
            console.log('Using template positions data. Create a positions.json file based on positions.template.json to use your own data.');
            return positions;
        } catch (error) {
            console.error('Error reading positions data:', error);
            return { positions: [] };
        }
    }
}

export async function GET() {
    try {
        const positionsData = await readPositionsData();
        
        // Convert any numeric tickers to strings
        const processedPositions = positionsData.positions.map((pos: { ticker: { toString: () => string; }; }) => ({
            ...pos,
            ticker: pos.ticker.toString()
        }));
        
        return NextResponse.json({ positions: processedPositions });
    } catch (error) {
        console.error('Error in positions API:', error);
        return NextResponse.json({ error: 'Failed to load positions data' }, { status: 500 });
    }
}
