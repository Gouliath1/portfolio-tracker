import { NextResponse } from 'next/server';
import { getActivePositionSet } from '@/database/operations/positionSetOperations';

export async function GET() {
    try {
        const activeSet = await getActivePositionSet();
        
        return NextResponse.json({
            isDemoData: activeSet?.info_type === 'warning',
            isDemo: activeSet?.info_type === 'warning', // Keep both for compatibility
            positionSet: activeSet ? {
                id: activeSet.id,
                name: activeSet.name,
                display_name: activeSet.display_name,
                description: activeSet.description,
                info_type: activeSet.info_type
            } : null
        });
        
    } catch (error) {
        console.error('❌ Error checking demo status:', error);
        return NextResponse.json(
            { error: 'Failed to check demo status' },
            { status: 500 }
        );
    }
}
