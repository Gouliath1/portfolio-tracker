/**
 * Demo database operations - Simple SQL inserts for template data
 */

import { getDbClient } from '../config';
import { createPositionSet } from './positionSetOperations';

/**
 * Initialize demo positions in database using pure SQL inserts
 * This creates sample positions without relying on external JSON files
 */
export const initializeDemoPositions = async (): Promise<void> => {
  console.log('Migrating demo positions to database...');
  
  const db = getDbClient();
  
  try {
    // First create the demo position set
    console.log('Creating demo position set...');
    const demoPositionSetId = await createPositionSet({
      name: 'demo',
      display_name: 'Demo Portfolio',
      description: 'You are currently viewing some sample portfolio data for demonstration purposes',
      info_type: 'warning',
      is_active: true
    });
    
    console.log(`Created demo position set with ID: ${demoPositionSetId}`);
    // First ensure we have the required accounts
    // Get CreditAgricole broker ID
    const brokerResult = await db.execute({
      sql: 'SELECT id FROM brokers WHERE name = ?',
      args: ['credit_agricole']
    });

    if (brokerResult.rows.length === 0) {
      throw new Error('CreditAgricole broker not found in database');
    }

    const brokerId = brokerResult.rows[0].id as number;

    // Create required accounts if they don't exist
    const requiredAccounts = ['General', 'JP NISA', 'JP General'];
    for (const accountName of requiredAccounts) {
      await db.execute({
        sql: 'INSERT OR IGNORE INTO accounts (broker_id, name, account_type) VALUES (?, ?, ?)',
        args: [brokerId, accountName, 'INDIVIDUAL']
      });
    }

    // Insert demo positions with simple SQL
    const demoPositions = [
      { ticker: 'AAPL', name: 'Apple Inc', currency: 'USD', account: 'General', quantity: 392, cost: 2.63, posCurrency: 'USD' },
      { ticker: 'MSFT', name: 'Microsoft Corp', currency: 'USD', account: 'General', quantity: 50, cost: 85.50, posCurrency: 'USD' },
      { ticker: 'GOOG', name: 'Alphabet Inc', currency: 'USD', account: 'General', quantity: 25, cost: 120.75, posCurrency: 'USD' },
      { ticker: '7940.T', name: 'Wavelock HLDGS', currency: 'JPY', account: 'JP NISA', quantity: 100, cost: 572.0, posCurrency: 'JPY' },
      { ticker: '8953.T', name: 'Japan City Fund', currency: 'JPY', account: 'JP General', quantity: 1, cost: 118000.0, posCurrency: 'JPY' },
      { ticker: '8986.T', name: 'Daiwa Securities Living Investment', currency: 'JPY', account: 'JP General', quantity: 1, cost: 106342.0, posCurrency: 'JPY' },
      { ticker: '4246.T', name: 'Daikyo Nishikawa', currency: 'JPY', account: 'JP General', quantity: 100, cost: 605.35, posCurrency: 'JPY' },
      { ticker: 'NVDA', name: 'Nvidia Corp', currency: 'USD', account: 'JP General', quantity: 2, cost: 110.71, posCurrency: 'USD' }
    ];

    for (const pos of demoPositions) {
      // Get or create security
      const securityResult = await db.execute({
        sql: 'SELECT id FROM securities WHERE ticker = ?',
        args: [pos.ticker]
      });

      let securityId: number;
      if (securityResult.rows.length === 0) {
        // Create security
        const insertSecurity = await db.execute({
          sql: 'INSERT INTO securities (ticker, name, currency) VALUES (?, ?, ?) RETURNING id',
          args: [pos.ticker, pos.name, pos.currency]
        });
        securityId = insertSecurity.rows[0].id as number;
      } else {
        securityId = securityResult.rows[0].id as number;
      }

      // Get account ID
      const accountResult = await db.execute({
        sql: 'SELECT id FROM accounts WHERE broker_id = ? AND name = ?',
        args: [brokerId, pos.account]
      });

      if (accountResult.rows.length === 0) {
        throw new Error(`Account ${pos.account} not found`);
      }

      const accountId = accountResult.rows[0].id as number;

      // Calculate cost basis (quantity * average_cost)
      const costBasis = pos.quantity * pos.cost;

      // Insert position with position set reference
      await db.execute({
        sql: 'INSERT INTO positions (position_set_id, security_id, account_id, quantity, average_cost, cost_basis, position_currency) VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: [demoPositionSetId, securityId, accountId, pos.quantity, pos.cost, costBasis, pos.posCurrency]
      });

      console.log(`Migrated demo position: ${pos.ticker}`);
    }

    console.log(`Successfully migrated ${demoPositions.length} demo positions to database`);
    
  } catch (error) {
    console.error('Error migrating demo positions:', error);
    throw error;
  }
};

/**
 * Clear all dynamic cached data (prices, fx rates)
 * Keep only core position data
 * @returns {Promise<void>}
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
 * @returns {Promise<void>}
 */
export const initializeDemoDatabase = async (): Promise<void> => {
    console.log('🎬 Initializing demo database...');
    
    await initializeDemoPositions();
    
    console.log('✅ Demo database initialized successfully');
};
