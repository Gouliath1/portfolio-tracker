import { NextResponse } from 'next/server';
import { RawPosition } from '@portfolio/types';
import { getActivePositions, replaceActivePositionSetPositions } from '@portfolio/server';

export async function GET() {
  try {
    console.log('📋 GET /api/positions - Fetching positions data');

    const positions = await getActivePositions();

    if (positions.length === 0) {
      console.log('📋 No positions found in active set');
      return NextResponse.json({
        positions: [],
        message: 'No positions found. You can import positions from a JSON file using the import feature.'
      });
    }

    console.log(`✅ Successfully fetched ${positions.length} positions`);
    return NextResponse.json({ positions });
  } catch (error) {
    console.error('❌ Error in positions GET:', error);
    return NextResponse.json(
      { error: 'Failed to fetch positions data' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.positions || !Array.isArray(body.positions)) {
      return NextResponse.json(
        { error: 'Invalid request: positions array required' },
        { status: 400 }
      );
    }

    const positions: RawPosition[] = body.positions;
    console.log(`📋 POST /api/positions - Importing ${positions.length} positions to database`);

    const importedCount = await replaceActivePositionSetPositions(positions);

    console.log(`✅ Successfully imported ${importedCount} positions to database`);

    return NextResponse.json({
      message: `Successfully imported ${importedCount} positions`,
      count: importedCount
    });

  } catch (error) {
    console.error('❌ Error importing positions:', error);
    return NextResponse.json(
      { error: 'Failed to import positions' },
      { status: 500 }
    );
  }
}
