/**
 * Demo database operations - Simple import from positions.json
 */

import fs from 'fs/promises';
import path from 'path';
import { getDbClient } from '../config';
import { createPositionSet } from './positionSetOperations';
import { RawPosition } from '@/types/portfolio';

/**
 * Initialize demo positions by importing from positions.json file
 * Uses the same logic as the import API but directly
 */
export const initializeDemoPositions = async (): Promise<void> => {
  console.log('📋 Loading demo positions from positions.json...');
  
  try {
    // Read the positions.json file
    const positionsPath = path.join(process.cwd(), 'data', 'positions.json');
    const fileContent = await fs.readFile(positionsPath, 'utf8');
    const positionsData = JSON.parse(fileContent);

    if (!positionsData.positions || !Array.isArray(positionsData.positions)) {
      throw new Error('Invalid positions.json format - expected positions array');
    }

    const positions: RawPosition[] = positionsData.positions;
    console.log(`📥 Importing demo position set with ${positions.length} positions...`);
    
    // Create the demo position set
    const positionSetId = await createPositionSet({
      name: 'demo',
      display_name: 'Demo Portfolio',
      description: 'Sample portfolio data for demonstration purposes',
      info_type: 'warning',
      is_active: true
    });
    
    // Import positions to the database (same logic as import API)
    const client = getDbClient();
    
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
              'UNKNOWN',
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
          
          // Get Credit Agricole broker (our default)
          const brokerResult = await client.execute({
            sql: 'SELECT id FROM brokers WHERE name = ?',
            args: ['credit_agricole']
          });
          
          const brokerId = Number(brokerResult.rows[0].id);
          
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
        
        // Parse transaction date
        let transactionDate = null;
        if (position.transactionDate) {
          const dateStr = position.transactionDate.replace(/\//g, '-'); // Convert YYYY/MM/DD to YYYY-MM-DD
          const parsedDate = new Date(dateStr);
          if (!isNaN(parsedDate.getTime())) {
            transactionDate = parsedDate.toISOString().split('T')[0];
          }
        }
        
        // Insert position
        await client.execute({
          sql: `INSERT INTO positions 
                (position_set_id, account_id, security_id, quantity, average_cost, cost_basis, position_currency, transaction_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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
        
        console.log(`Loaded demo position: ${position.ticker} (${transactionDate || 'no date'})`);
        
      } catch (positionError) {
        console.error(`❌ Error processing position ${position.ticker}:`, positionError);
      }
    }
    
    console.log(`✅ Successfully loaded ${positions.length} demo positions`);
    
  } catch (error) {
    console.error('❌ Error loading demo positions:', error);
    throw error;
  }
};

/**
 * Clear all dynamic cached data (prices, fx rates)
 * Keep only core position data
 */
export const clearCachedData = async (): Promise<void> => {
  console.log('Clearing cached price and FX rate data...');
  
  const client = getDbClient();
  
  try {
    await client.execute('BEGIN TRANSACTION');
    
    // Clear historical prices (will be refetched from Yahoo)
    await client.execute('DELETE FROM securities_prices');
    console.log('Cleared historical prices cache');
    
    // Clear FX rates (will be refetched from Yahoo)
    await client.execute('DELETE FROM fx_rates');
    console.log('Cleared FX rates cache');
    
    await client.execute('COMMIT');
    console.log('Cache clearing completed successfully');
    
  } catch (error) {
    await client.execute('ROLLBACK');
    console.error('Failed to clear cached data:', error);
    throw error;
  }
};

/**
 * Initialize database with demo data only
 */
export const initializeDemoDatabase = async (): Promise<void> => {
  console.log('🎬 Initializing demo database...');
  
  await initializeDemoPositions();
  
  console.log('✅ Demo database initialized successfully');
};
