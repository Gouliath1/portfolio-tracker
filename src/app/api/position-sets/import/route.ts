import { NextResponse } from 'next/server';
import { createPositionSet } from '@/database/operations/positionSetOperations';
import { RawPosition } from '@/types/portfolio';
import { getDbClient } from '@/database/config';

interface ImportPositionSetRequest {
    name: string;
    description?: string;
    positions: RawPosition[];
    set_as_active?: boolean;
}

export async function POST(request: Request) {
    try {
        const body: ImportPositionSetRequest = await request.json();
        const { name, description, positions, set_as_active } = body;
        
        // Validation
        if (!name || !positions || !Array.isArray(positions)) {
            return NextResponse.json({
                error: 'Missing required fields: name and positions array'
            }, { status: 400 });
        }
        
        if (positions.length === 0) {
            return NextResponse.json({
                error: 'Positions array cannot be empty'
            }, { status: 400 });
        }
        
        console.log(`📥 Importing position set "${name}" with ${positions.length} positions...`);
        
        // Create the position set
        const positionSetId = await createPositionSet({
            name,
            display_name: name, // Use name as display name
            description,
            info_type: 'info',
            is_active: set_as_active || false
        });
        
        // Import positions to the database
        const client = getDbClient();
        
        // Process each position
        for (const position of positions) {
            try {
                // Ensure the security exists
                const securityResult = await client.execute({
                    sql: 'SELECT id FROM securities WHERE ticker = ?',
                    args: [position.ticker]
                });
                
                let securityId: number;
                if (securityResult.rows.length === 0) {
                    console.log(`📄 Creating security for ${position.ticker}`);
                    const insertSecurityResult = await client.execute({
                        sql: `INSERT INTO securities (ticker, name, exchange, currency) 
                              VALUES (?, ?, ?, ?)`,
                        args: [
                            position.ticker,
                            position.fullName || position.ticker,
                            'UNKNOWN', // Exchange will be updated when prices are fetched
                            position.transactionCcy || 'USD'
                        ]
                    });
                    securityId = Number(insertSecurityResult.lastInsertRowid);
                } else {
                    securityId = Number(securityResult.rows[0].id);
                }
                
                // Ensure the account exists
                const accountResult = await client.execute({
                    sql: `SELECT a.id FROM accounts a 
                          JOIN brokers b ON a.broker_id = b.id 
                          WHERE a.name = ?`,
                    args: [position.account]
                });
                
                let accountId: number;
                if (accountResult.rows.length === 0) {
                    console.log(`📄 Creating account for ${position.account}`);
                    
                    // Get or create broker
                    const brokerResult = await client.execute({
                        sql: 'SELECT id FROM brokers WHERE name = ?',
                        args: ['Unknown Broker']
                    });
                    
                    let brokerId: number;
                    if (brokerResult.rows.length === 0) {
                        const insertBrokerResult = await client.execute({
                            sql: `INSERT INTO brokers (name, display_name, default_currency) 
                                  VALUES (?, ?, ?)`,
                            args: ['Unknown Broker', 'Unknown Broker', 'USD']
                        });
                        brokerId = Number(insertBrokerResult.lastInsertRowid);
                    } else {
                        brokerId = Number(brokerResult.rows[0].id);
                    }
                    
                    // Create account
                    const insertAccountResult = await client.execute({
                        sql: `INSERT INTO accounts (name, broker_id, base_currency) 
                              VALUES (?, ?, ?)`,
                        args: [
                            position.account,
                            brokerId,
                            position.transactionCcy || 'USD'
                        ]
                    });
                    accountId = Number(insertAccountResult.lastInsertRowid);
                } else {
                    accountId = Number(accountResult.rows[0].id);
                }
                
                // Calculate cost basis
                const costBasis = position.quantity * position.costPerUnit;
                
                // Parse transaction date from various formats
                let transactionDate = null;
                if (position.transactionDate) {
                    const dateStr = position.transactionDate.replace(/\//g, '-'); // Convert YYYY/MM/DD to YYYY-MM-DD
                    const parsedDate = new Date(dateStr);
                    if (!isNaN(parsedDate.getTime())) {
                        transactionDate = parsedDate.toISOString().split('T')[0]; // YYYY-MM-DD format
                    }
                }
                
                // Insert or update position
                await client.execute({
                    sql: `INSERT INTO positions 
                          (position_set_id, account_id, security_id, quantity, average_cost, cost_basis, position_currency, transaction_date)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                          ON CONFLICT (position_set_id, account_id, security_id) 
                          DO UPDATE SET 
                              quantity = quantity + excluded.quantity,
                              cost_basis = cost_basis + excluded.cost_basis,
                              average_cost = cost_basis / quantity,
                              last_updated = CURRENT_TIMESTAMP`,
                    args: [
                        positionSetId,
                        accountId,
                        securityId,
                        position.quantity,
                        position.costPerUnit,
                        costBasis,
                        position.transactionCcy || 'USD',
                        transactionDate
                    ]
                });
                
            } catch (positionError) {
                console.error(`❌ Error processing position ${position.ticker}:`, positionError);
                // Continue with other positions
            }
        }
        
        console.log(`✅ Successfully imported position set "${name}" with ${positions.length} positions`);
        
        return NextResponse.json({
            message: 'Position set imported successfully',
            position_set_id: positionSetId,
            positions_imported: positions.length
        });
        
    } catch (error) {
        console.error('❌ Error importing position set:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Failed to import position set'
        }, { status: 500 });
    }
}
