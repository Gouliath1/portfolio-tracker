import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { RawPosition } from '../../../../types/portfolio';

const POSITIONS_FILE = path.join(process.cwd(), 'src/data/positions.json');

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { positions }: { positions: RawPosition[] } = body;

        // Validate the positions data
        if (!Array.isArray(positions)) {
            return NextResponse.json(
                { error: 'Invalid positions data' },
                { status: 400 }
            );
        }

        // Create the updated data structure
        const data = { positions };

        // Write to file
        fs.writeFileSync(POSITIONS_FILE, JSON.stringify(data, null, 2));

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating positions:', error);
        return NextResponse.json(
            { error: 'Failed to update positions' },
            { status: 500 }
        );
    }
}
