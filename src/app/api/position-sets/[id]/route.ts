import { NextResponse } from 'next/server';
import { deletePositionSetById } from '@portfolio/server';

export async function DELETE(
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
        
        await deletePositionSetById(positionSetId);
        
        return NextResponse.json({
            message: 'Position set deleted successfully'
        });
    } catch (error) {
        console.error('❌ Error deleting position set:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Failed to delete position set'
        }, { status: 500 });
    }
}
