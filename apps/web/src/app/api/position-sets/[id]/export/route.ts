import { NextResponse } from 'next/server';
import { exportPositionSetById } from '@portfolio/server';

export async function GET(
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
        
        const exportData = await exportPositionSetById(positionSetId);

        // Set headers for file download
        const headers = new Headers();
        headers.set('Content-Type', 'application/json');
        headers.set('Content-Disposition', `attachment; filename="${exportData.positionSet.name}-positions.json"`);
        
        return new NextResponse(JSON.stringify(exportData, null, 2), {
            status: 200,
            headers
        });
        
    } catch (error) {
        console.error('❌ Error exporting position set:', error);
        const message = error instanceof Error ? error.message : 'Failed to export position set';
        const status = message.toLowerCase().includes('not found') ? 404 : 500;
        return NextResponse.json({
            error: status === 404 ? 'Position set not found' : 'Failed to export position set',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status });
    }
}
