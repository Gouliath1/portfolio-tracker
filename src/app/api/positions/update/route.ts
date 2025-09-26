import { NextRequest, NextResponse } from 'next/server';
import { writePositionsFile } from '@portfolio/server';
import { RawPosition } from '@portfolio/types';

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

        // Write to file
        await writePositionsFile(positions);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating positions:', error);
        return NextResponse.json(
            { error: 'Failed to update positions' },
            { status: 500 }
        );
    }
}
