import { NextResponse } from 'next/server';
import { importPositionsFromFile, getPositionsFileStatus } from '@portfolio/server';

export async function POST() {
    try {
        console.log('📥 Import positions from JSON file initiated...');
        
        const result = await importPositionsFromFile();
        
        console.log(`✅ Successfully imported ${result.count} positions from JSON to database`);
        
        return NextResponse.json({ 
            message: `Successfully imported ${result.count} positions from positions.json`,
            count: result.count
        });
        
    } catch (error) {
        console.error('❌ Error importing from JSON:', error);
        return NextResponse.json(
            { error: 'Failed to import positions from JSON file' },
            { status: 500 }
        );
    }
}

export async function GET() {
    try {
        // Check if positions.json exists
        const status = await getPositionsFileStatus();
        return NextResponse.json(status);
        
    } catch (error) {
        console.error('❌ Error checking JSON file:', error);
        return NextResponse.json(
            { error: 'Failed to check positions.json file' },
            { status: 500 }
        );
    }
}
