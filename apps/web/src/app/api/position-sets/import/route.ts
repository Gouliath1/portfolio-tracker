import { NextResponse } from 'next/server';
import { importPositionSetData } from '@portfolio/server';
import { RawPosition } from '@portfolio/types';

interface ImportPositionSetRequest {
    name: string;
    description?: string;
    positions: RawPosition[];
    set_as_active?: boolean;
}

export async function POST(request: Request) {
    try {
        const body: ImportPositionSetRequest = await request.json();
        const { name, description, positions, set_as_active } = body;
        
        // Validation
        if (!name || !positions || !Array.isArray(positions)) {
            return NextResponse.json({
                error: 'Missing required fields: name and positions array'
            }, { status: 400 });
        }
        
        if (positions.length === 0) {
            return NextResponse.json({
                error: 'Positions array cannot be empty'
            }, { status: 400 });
        }
        
        console.log(`📥 Importing position set "${name}" with ${positions.length} positions...`);
        
        const result = await importPositionSetData({
            name,
            description,
            positions,
            setAsActive: set_as_active
        });

        console.log(`✅ Successfully imported position set "${name}" with ${result.positionsImported} positions`);

        return NextResponse.json({
            message: 'Position set imported successfully',
            position_set_id: result.positionSetId,
            positions_imported: result.positionsImported
        });
        
    } catch (error) {
        console.error('❌ Error importing position set:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Failed to import position set'
        }, { status: 500 });
    }
}
