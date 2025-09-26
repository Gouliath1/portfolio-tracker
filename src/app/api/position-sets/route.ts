import { NextResponse } from 'next/server';
import { getPositionSetsOverview } from '@portfolio/server';

export async function GET() {
    try {
        const overview = await getPositionSetsOverview();
        
        return NextResponse.json({
            position_sets: overview.positionSets,
            active_set: overview.activeSet
        });
    } catch (error) {
        console.error('❌ Error fetching position sets:', error);
        return NextResponse.json({
            error: 'Failed to fetch position sets'
        }, { status: 500 });
    }
}
