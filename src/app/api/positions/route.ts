import { NextResponse } from 'next/server';
import { RawPosition } from '@portfolio/types';

async function getPositionsFromDatabase(): Promise<RawPosition[]> {
    try {
        const { getDbClient } = await import('@portfolio/server');
        const client = getDbClient();
        
        // Get the active position set
        const activeSetResult = await client.execute(`
            SELECT id FROM position_sets WHERE is_active = TRUE LIMIT 1
        `);
        
        if (activeSetResult.rows.length === 0) {
            console.log('No active position set found');
            return []; // Return empty array if no active position set
        }
        
        const activePositionSetId = Number(activeSetResult.rows[0].id);
        
        // Check if we have positions in the active position set
        const countResult = await client.execute({
            sql: 'SELECT COUNT(*) as count FROM positions WHERE position_set_id = ?',
            args: [activePositionSetId]
        });
        const count = Number(countResult.rows[0].count);
        
        if (count === 0) {
            return []; // Return empty array if no positions
        }
        
        // Query positions with joined data from active position set
        const result = await client.execute({
            sql: `
                SELECT 
                    p.quantity,
                    p.average_cost as costPerUnit,
                    p.position_currency as transactionCcy,
                    p.transaction_date as transactionDate,
                    s.ticker,
                    s.name as fullName,
                    s.currency as stockCcy,
                    a.name as account,
                    b.display_name as broker
                FROM positions p
                JOIN securities s ON p.security_id = s.id
                JOIN accounts a ON p.account_id = a.id
                JOIN brokers b ON a.broker_id = b.id
                WHERE p.position_set_id = ?
                ORDER BY s.ticker
            `,
            args: [activePositionSetId]
        });
        
        return result.rows.map(row => ({
            transactionDate: String(row.transactionDate), // Use actual transaction date from database
            ticker: String(row.ticker),
            fullName: String(row.fullName),
            broker: String(row.broker),
            account: String(row.account),
            quantity: Number(row.quantity),
            costPerUnit: Number(row.costPerUnit),
            transactionCcy: String(row.transactionCcy),
            stockCcy: String(row.stockCcy || row.transactionCcy)
        }));
        
    } catch (error) {
        console.error('❌ Error reading positions from database:', error);
        throw error; // Let the caller handle the error
    }
}

export async function GET() {
    try {
        console.log('📋 GET /api/positions - Fetching positions data');
        
        const positions = await getPositionsFromDatabase();
        
        if (positions.length === 0) {
            console.log('📋 No positions found in database');
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
        
        // Clear existing positions and import new ones
        const { getDbClient } = await import('@portfolio/server');
        const db = getDbClient();
        
        // Clear existing positions
        await db.execute('DELETE FROM positions');
        console.log('🧹 Cleared existing positions from database');
        
        // Import each position to database
        for (const position of positions) {
            // Get or create security
            const securityResult = await db.execute({
                sql: 'SELECT id FROM securities WHERE ticker = ?',
                args: [position.ticker]
            });

            let securityId: number;
            if (securityResult.rows.length > 0) {
                securityId = Number(securityResult.rows[0].id);
            } else {
                // Create security
                const insertResult = await db.execute({
                    sql: 'INSERT INTO securities (ticker, name, currency) VALUES (?, ?, ?) RETURNING id',
                    args: [position.ticker, position.fullName || position.ticker, position.stockCcy || position.transactionCcy]
                });
                securityId = Number(insertResult.rows[0].id);
            }

            // Get or create broker
            const brokerResult = await db.execute({
                sql: 'SELECT id FROM brokers WHERE display_name = ?',
                args: [position.broker || 'Unknown']
            });

            let brokerId: number;
            if (brokerResult.rows.length > 0) {
                brokerId = Number(brokerResult.rows[0].id);
            } else {
                // Create broker
                const insertResult = await db.execute({
                    sql: 'INSERT INTO brokers (name, display_name, country_code) VALUES (?, ?, ?) RETURNING id',
                    args: [position.broker || 'Unknown', position.broker || 'Unknown', 'US']
                });
                brokerId = Number(insertResult.rows[0].id);
            }

            // Get or create account
            const accountResult = await db.execute({
                sql: 'SELECT id FROM accounts WHERE name = ? AND broker_id = ?',
                args: [position.account || 'Default', brokerId]
            });

            let accountId: number;
            if (accountResult.rows.length > 0) {
                accountId = Number(accountResult.rows[0].id);
            } else {
                // Create account
                const insertResult = await db.execute({
                    sql: 'INSERT INTO accounts (name, broker_id, account_type, base_currency) VALUES (?, ?, ?, ?) RETURNING id',
                    args: [position.account || 'Default', brokerId, 'BROKERAGE', position.transactionCcy]
                });
                accountId = Number(insertResult.rows[0].id);
            }

            // Insert position
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
