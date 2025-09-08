import { NextResponse } from 'next/server';
import { RawPosition } from '@/types/portfolio';
import { promises as fs } from 'fs';
import path from 'path';

const POSITIONS_JSON_PATH = path.join(process.cwd(), 'data/positions.json');
const POSITIONS_TEMPLATE_PATH = path.join(process.cwd(), 'data/positions.template.json');

async function getPositionsFromDatabase(): Promise<RawPosition[] | null> {
    try {
        const { getDbClient } = await import('@/database');
        const client = getDbClient();
        
        // Check if we have positions in database
        const countResult = await client.execute('SELECT COUNT(*) as count FROM positions');
        const count = Number(countResult.rows[0].count);
        
        if (count === 0) {
            return null; // No data in database, will fallback to JSON
        }
        
        // Query positions with joined data
        const result = await client.execute(`
            SELECT 
                p.quantity,
                p.average_cost as costPerUnit,
                p.position_currency as transactionCcy,
                s.ticker,
                s.name as fullName,
                s.currency as stockCcy,
                a.name as account,
                b.display_name as broker
            FROM positions p
            JOIN securities s ON p.security_id = s.id
            JOIN accounts a ON p.account_id = a.id
            JOIN brokers b ON a.broker_id = b.id
            ORDER BY s.ticker
        `);
        
        return result.rows.map(row => ({
            transactionDate: '2023/01/01', // Default date - not critical for calculations
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
        return null;
    }
}

async function getPositionsFromJson(): Promise<RawPosition[]> {
    try {
        // Try main positions.json first
        let data: string;
        let filePath = POSITIONS_JSON_PATH;
        
        try {
            data = await fs.readFile(POSITIONS_JSON_PATH, 'utf-8');
            console.log('📋 Loading positions from positions.json');
        } catch {
            // If main file doesn't exist, fall back to template
            console.log('📋 positions.json not found, using template...');
            data = await fs.readFile(POSITIONS_TEMPLATE_PATH, 'utf-8');
            filePath = POSITIONS_TEMPLATE_PATH;
        }
        
        const jsonData = JSON.parse(data);
        
        // Handle both array format and object with positions property
        let jsonPositions = jsonData;
        if (jsonData && jsonData.positions) {
            jsonPositions = jsonData.positions;
        }
        
        const positions = Array.isArray(jsonPositions) ? jsonPositions : [];
        console.log(`📋 Loaded ${positions.length} positions from ${path.basename(filePath)}`);
        
        return positions;
    } catch (error) {
        console.error('❌ Error reading positions from JSON files:', error);
        return [];
    }
}

async function cachePositionsToDatabase(positions: RawPosition[]): Promise<void> {
    try {
        console.log('💾 Caching positions to database...');
        const { getDbClient } = await import('@/database');
        const db = getDbClient();

        for (const position of positions) {
            // Get or create security
            const securityResult = await db.execute({
                sql: 'SELECT id FROM securities WHERE ticker = ?',
                args: [position.ticker]
            });

            let securityId: number;
            if (securityResult.rows.length === 0) {
                // Create security
                const insertSecurity = await db.execute({
                    sql: 'INSERT INTO securities (ticker, name, currency) VALUES (?, ?, ?) RETURNING id',
                    args: [position.ticker, position.fullName, position.stockCcy || position.transactionCcy]
                });
                securityId = insertSecurity.rows[0].id as number;
            } else {
                securityId = securityResult.rows[0].id as number;
            }

            // Get or create broker
            const brokerResult = await db.execute({
                sql: 'SELECT id FROM brokers WHERE display_name = ?',
                args: [position.broker || 'Unknown']
            });

            let brokerId: number;
            if (brokerResult.rows.length === 0) {
                // Create broker
                const code = (position.broker || 'UNKNOWN').toUpperCase().replace(/\s+/g, '_');
                const insertBroker = await db.execute({
                    sql: 'INSERT INTO brokers (code, display_name) VALUES (?, ?) RETURNING id',
                    args: [code, position.broker || 'Unknown']
                });
                brokerId = insertBroker.rows[0].id as number;
            } else {
                brokerId = brokerResult.rows[0].id as number;
            }

            // Get or create account
            const accountResult = await db.execute({
                sql: 'SELECT id FROM accounts WHERE broker_id = ? AND name = ?',
                args: [brokerId, position.account]
            });

            let accountId: number;
            if (accountResult.rows.length === 0) {
                // Create account
                const insertAccount = await db.execute({
                    sql: 'INSERT INTO accounts (broker_id, name, account_type) VALUES (?, ?, ?) RETURNING id',
                    args: [brokerId, position.account, 'INDIVIDUAL']
                });
                accountId = insertAccount.rows[0].id as number;
            } else {
                accountId = accountResult.rows[0].id as number;
            }

            // Insert position
            await db.execute({
                sql: 'INSERT INTO positions (security_id, account_id, quantity, average_cost, position_currency) VALUES (?, ?, ?, ?, ?)',
                args: [securityId, accountId, position.quantity, position.costPerUnit, position.transactionCcy]
            });
        }
        
        console.log(`✅ Successfully cached ${positions.length} positions to database`);
    } catch (error) {
        console.error('❌ Error caching positions to database:', error);
    }
}

export async function GET() {
    try {
        console.log('📋 GET /api/positions - Fetching positions data');
        
        // Try to get positions from database first
        let positions = await getPositionsFromDatabase();
        
        if (!positions) {
            // No data in database, get from JSON and cache to database
            console.log('📄 No positions in database, loading from JSON files...');
            const jsonPositions = await getPositionsFromJson();
            positions = jsonPositions;
            
            // Only cache to database if we loaded from the actual positions.json file
            // (not template), or if database is truly empty and we want to populate with template
            if (positions.length > 0) {
                try {
                    // Check if main positions.json exists to decide caching behavior
                    await fs.access(POSITIONS_JSON_PATH);
                    console.log('💾 Caching actual positions to database...');
                    await cachePositionsToDatabase(positions);
                } catch {
                    // Main file doesn't exist, we're using template - database already has template data
                    console.log('📋 Using template data, database should already have this data');
                }
            }
        }
        
        console.log(`✅ Successfully fetched ${positions.length} positions`);
        
        return NextResponse.json({ 
            success: true,
            positions: positions,
            count: positions.length
        });
    } catch (error) {
        console.error('❌ Error in positions API:', error);
        return NextResponse.json({ 
            success: false,
            error: 'Failed to load positions data',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
