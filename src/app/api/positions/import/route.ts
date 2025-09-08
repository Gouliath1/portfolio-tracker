import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { RawPosition } from '@/types/portfolio';

const POSITIONS_JSON_PATH = path.join(process.cwd(), 'data/positions.json');

export async function POST() {
    try {
        console.log('📥 Import positions from JSON file initiated...');
        
        // Check if positions.json exists
        try {
            await fs.access(POSITIONS_JSON_PATH);
        } catch {
            return NextResponse.json({
                error: 'positions.json file not found in data directory'
            }, { status: 404 });
        }
        
        // Read and parse the JSON file
        const data = await fs.readFile(POSITIONS_JSON_PATH, 'utf-8');
        const jsonData = JSON.parse(data);
        
        // Handle both array format and object with positions property
        let positions: RawPosition[] = [];
        if (Array.isArray(jsonData)) {
            positions = jsonData;
        } else if (jsonData.positions && Array.isArray(jsonData.positions)) {
            positions = jsonData.positions;
        } else {
            return NextResponse.json({
                error: 'Invalid JSON format. Expected array of positions or object with positions property.'
            }, { status: 400 });
        }
        
        if (positions.length === 0) {
            return NextResponse.json({
                error: 'No positions found in the JSON file'
            }, { status: 400 });
        }
        
        console.log(`📋 Found ${positions.length} positions in JSON file`);
        
        // Import to database
        const { getDbClient } = await import('@/database');
        const db = getDbClient();
        
        // Clear existing positions
        await db.execute('DELETE FROM positions');
        console.log('🧹 Cleared existing positions from database');
        
        // Import each position
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
        
        console.log(`✅ Successfully imported ${positions.length} positions from JSON to database`);
        
        return NextResponse.json({ 
            message: `Successfully imported ${positions.length} positions from positions.json`,
            count: positions.length 
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
        try {
            await fs.access(POSITIONS_JSON_PATH);
            
            // Preview the file content
            const data = await fs.readFile(POSITIONS_JSON_PATH, 'utf-8');
            const jsonData = JSON.parse(data);
            
            let positionCount = 0;
            if (Array.isArray(jsonData)) {
                positionCount = jsonData.length;
            } else if (jsonData.positions && Array.isArray(jsonData.positions)) {
                positionCount = jsonData.positions.length;
            }
            
            return NextResponse.json({
                hasFile: true,
                positionCount,
                message: `Found positions.json with ${positionCount} positions ready to import`
            });
            
        } catch {
            return NextResponse.json({
                hasFile: false,
                positionCount: 0,
                message: 'No positions.json file found. Place your positions.json file in the data/ directory to import.'
            });
        }
        
    } catch (error) {
        console.error('❌ Error checking JSON file:', error);
        return NextResponse.json(
            { error: 'Failed to check positions.json file' },
            { status: 500 }
        );
    }
}
