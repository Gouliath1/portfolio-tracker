import { NextResponse } from 'next/server';
import { RawPosition } from '@portfolio/types';
import { getPositionsForActiveSet } from '@portfolio/server';

export async function GET() {
  try {
    console.log('📋 GET /api/positions - Fetching positions data');

    const positions = await getPositionsForActiveSet();

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

    const { getDbClient } = await import('@portfolio/server');
    const db = getDbClient();

    await db.execute('DELETE FROM positions');
    console.log('🧹 Cleared existing positions from database');

    for (const position of positions) {
      const securityResult = await db.execute({
        sql: 'SELECT id FROM securities WHERE ticker = ?',
        args: [position.ticker]
      });

      let securityId: number;
      if (securityResult.rows.length > 0) {
        securityId = Number(securityResult.rows[0].id);
      } else {
        const insertResult = await db.execute({
          sql: 'INSERT INTO securities (ticker, name, currency) VALUES (?, ?, ?) RETURNING id',
          args: [position.ticker, position.fullName || position.ticker, position.stockCcy || position.transactionCcy]
        });
        securityId = Number(insertResult.rows[0].id);
      }

      const brokerResult = await db.execute({
        sql: 'SELECT id FROM brokers WHERE display_name = ?',
        args: [position.broker || 'Unknown']
      });

      let brokerId: number;
      if (brokerResult.rows.length > 0) {
        brokerId = Number(brokerResult.rows[0].id);
      } else {
        const insertResult = await db.execute({
          sql: 'INSERT INTO brokers (name, display_name, country_code) VALUES (?, ?, ?) RETURNING id',
          args: [position.broker || 'Unknown', position.broker || 'Unknown', 'US']
        });
        brokerId = Number(insertResult.rows[0].id);
      }

      const accountResult = await db.execute({
        sql: 'SELECT id FROM accounts WHERE name = ? AND broker_id = ?',
        args: [position.account || 'Default', brokerId]
      });

      let accountId: number;
      if (accountResult.rows.length > 0) {
        accountId = Number(accountResult.rows[0].id);
      } else {
        const insertResult = await db.execute({
          sql: 'INSERT INTO accounts (name, broker_id, account_type, base_currency) VALUES (?, ?, ?, ?) RETURNING id',
          args: [position.account || 'Default', brokerId, 'BROKERAGE', position.transactionCcy]
        });
        accountId = Number(insertResult.rows[0].id);
      }

      await db.execute({
        sql: `INSERT INTO positions (security_id, account_id, quantity, average_cost, position_currency) 
              VALUES (?, ?, ?, ?, ?)`,
        args: [securityId, accountId, position.quantity, position.costPerUnit, position.transactionCcy]
      });
    }

    console.log(`✅ Successfully imported ${positions.length} positions to database`);

    return NextResponse.json({
      message: `Successfully imported ${positions.length} positions`,
      count: positions.length
    });

  } catch (error) {
    console.error('❌ Error importing positions:', error);
    return NextResponse.json(
      { error: 'Failed to import positions' },
      { status: 500 }
    );
  }
}
