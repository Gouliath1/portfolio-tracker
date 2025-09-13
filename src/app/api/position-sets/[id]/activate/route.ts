import { NextResponse } from 'next/server';
import { setActivePositionSet } from '@/database/operations/positionSetOperations';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const positionSetId = parseInt(id);
        
        if (isNaN(positionSetId)) {
            return NextResponse.json({
                error: 'Invalid position set ID'
            }, { status: 400 });
        }
        
        await setActivePositionSet(positionSetId);
        
        return NextResponse.json({
            message: 'Position set activated successfully'
        });
    } catch (error) {
        console.error('❌ Error activating position set:', error);
        return NextResponse.json({
            error: 'Failed to activate position set'
        }, { status: 500 });
    }
}
