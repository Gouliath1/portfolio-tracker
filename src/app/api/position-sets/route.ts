import { NextResponse } from 'next/server';
import { getAllPositionSets, getActivePositionSet } from '@/database/operations/positionSetOperations';

export async function GET() {
    try {
        const [allSets, activeSet] = await Promise.all([
            getAllPositionSets(),
            getActivePositionSet()
        ]);
        
        return NextResponse.json({
            position_sets: allSets,
            active_set: activeSet
        });
    } catch (error) {
        console.error('❌ Error fetching position sets:', error);
        return NextResponse.json({
            error: 'Failed to fetch position sets'
        }, { status: 500 });
    }
}
