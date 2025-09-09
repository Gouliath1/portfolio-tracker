/**
 * Database schema definitions and initialization
 * Creates all tables according to 2NF design
 */

import { getDbClient } from './config';

/**
 * SQL schema for creating all database tables
 */
const SCHEMA_SQL = {
  // Brokers table
  brokers: `
    CREATE TABLE IF NOT EXISTS brokers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      default_currency TEXT NOT NULL DEFAULT 'USD',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

  // Currencies table
  currencies: `
    CREATE TABLE IF NOT EXISTS currencies (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      symbol TEXT NOT NULL,
      decimal_places INTEGER DEFAULT 2,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

  // Accounts table
  accounts: `
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      broker_id INTEGER NOT NULL,
      account_number TEXT,
      account_type TEXT DEFAULT 'investment',
      base_currency TEXT NOT NULL DEFAULT 'USD',
      is_active BOOLEAN DEFAULT TRUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (broker_id) REFERENCES brokers (id),
      FOREIGN KEY (base_currency) REFERENCES currencies (code),
      UNIQUE (broker_id, account_number)
    )`,

  // Securities table
  securities: `
    CREATE TABLE IF NOT EXISTS securities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      security_type TEXT NOT NULL DEFAULT 'stock',
      currency TEXT NOT NULL DEFAULT 'USD',
      exchange TEXT,
      sector TEXT,
      industry TEXT,
      country TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (currency) REFERENCES currencies (code)
    )`,

  // Position sets table - allows for multiple data sets (demo, user data, scenarios)
  position_sets: `
    CREATE TABLE IF NOT EXISTS position_sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      description TEXT,
      info_type TEXT NOT NULL DEFAULT 'info',
      is_active BOOLEAN DEFAULT FALSE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

  // Positions table
  positions: `
    CREATE TABLE IF NOT EXISTS positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      position_set_id INTEGER NOT NULL,
      account_id INTEGER NOT NULL,
      security_id INTEGER NOT NULL,
      quantity DECIMAL(15,6) NOT NULL,
      average_cost DECIMAL(15,4) NOT NULL,
      cost_basis DECIMAL(15,2) NOT NULL,
      position_currency TEXT NOT NULL,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (position_set_id) REFERENCES position_sets (id),
      FOREIGN KEY (account_id) REFERENCES accounts (id),
      FOREIGN KEY (security_id) REFERENCES securities (id),
      FOREIGN KEY (position_currency) REFERENCES currencies (code),
      UNIQUE (position_set_id, account_id, security_id)
    )`,

  // Securities prices table (historical prices data)
  securities_prices: `
    CREATE TABLE IF NOT EXISTS securities_prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      security_id INTEGER NOT NULL,
      price_date DATE NOT NULL,
      open_price DECIMAL(15,4),
      high_price DECIMAL(15,4),
      low_price DECIMAL(15,4),
      close_price DECIMAL(15,4) NOT NULL,
      adjusted_close DECIMAL(15,4),
      volume BIGINT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (security_id) REFERENCES securities (id),
      UNIQUE (security_id, price_date)
    )`,

  // FX rates table
  fx_rates: `
    CREATE TABLE IF NOT EXISTS fx_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_currency TEXT NOT NULL,
      to_currency TEXT NOT NULL,
      rate DECIMAL(15,8) NOT NULL,
      rate_date DATE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (from_currency) REFERENCES currencies (code),
      FOREIGN KEY (to_currency) REFERENCES currencies (code),
      UNIQUE (from_currency, to_currency, rate_date)
    )`
};

/**
 * Default data to insert on initialization
 */
const DEFAULT_DATA = {
  currencies: [
    { code: 'USD', name: 'US Dollar', symbol: '$' },
    { code: 'EUR', name: 'Euro', symbol: '€' },
    { code: 'GBP', name: 'British Pound', symbol: '£' },
    { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimal_places: 0 },
    { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
    { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
    { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
    { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
    { code: 'INR', name: 'Indian Rupee', symbol: '₹' }
  ],

  brokers: [
    { name: 'credit_agricole', display_name: 'Credit Agricole', default_currency: 'EUR' },
    { name: 'rakuten', display_name: 'Rakuten Securities', default_currency: 'JPY' },
    { name: 'interactive_brokers', display_name: 'Interactive Brokers', default_currency: 'USD' },
    { name: 'charles_schwab', display_name: 'Charles Schwab', default_currency: 'USD' },
    { name: 'fidelity', display_name: 'Fidelity', default_currency: 'USD' },
    { name: 'vanguard', display_name: 'Vanguard', default_currency: 'USD' },
    { name: 'td_ameritrade', display_name: 'TD Ameritrade', default_currency: 'USD' },
    { name: 'etoro', display_name: 'eToro', default_currency: 'USD' },
    { name: 'robinhood', display_name: 'Robinhood', default_currency: 'USD' },
    { name: 'webull', display_name: 'Webull', default_currency: 'USD' }
  ]
};

/**
 * Initialize the database schema
 * @returns {Promise<void>}
 */
export const initializeDatabase = async (): Promise<void> => {
  console.log('Initializing database schema...');
  
  try {
    const client = getDbClient();
    
    // Create all tables
    for (const [tableName, sql] of Object.entries(SCHEMA_SQL)) {
      console.log(`Creating table: ${tableName}`);
      await client.execute(sql);
    }
    
    console.log('Database schema created successfully');
  } catch (error) {
    console.error('Failed to initialize database schema:', error);
    throw error;
  }
};

/**
 * Insert default reference data
 * @returns {Promise<void>}
 */
export const insertDefaultData = async (): Promise<void> => {
  console.log('Inserting default reference data...');
  
  try {
    const client = getDbClient();
    
    // Insert currencies
    for (const currency of DEFAULT_DATA.currencies) {
      await client.execute({
        sql: `INSERT OR IGNORE INTO currencies (code, name, symbol, decimal_places) 
              VALUES (?, ?, ?, ?)`,
        args: [
          currency.code,
          currency.name,
          currency.symbol,
          currency.decimal_places || 2
        ]
      });
    }
    
    // Insert brokers
    for (const broker of DEFAULT_DATA.brokers) {
      await client.execute({
        sql: `INSERT OR IGNORE INTO brokers (name, display_name, default_currency) 
              VALUES (?, ?, ?)`,
        args: [
          broker.name,
          broker.display_name,
          broker.default_currency
        ]
      });
    }
    
    console.log('Default reference data inserted successfully');
  } catch (error) {
    console.error('Failed to insert default data:', error);
    throw error;
  }
};

/**
 * Full database setup (schema + default data)
 * @returns {Promise<void>}
 */
export const setupDatabase = async (): Promise<void> => {
  await initializeDatabase();
  await insertDefaultData();
  console.log('Database setup completed successfully');
};

/**
 * Drop all tables (for testing/reset purposes)
 * @returns {Promise<void>}
 */
export const dropAllTables = async (): Promise<void> => {
  console.log('Dropping all database tables...');
  
  try {
    const client = getDbClient();
    const tableNames = Object.keys(SCHEMA_SQL).reverse(); // Reverse order for FK constraints
    
    for (const tableName of tableNames) {
      await client.execute(`DROP TABLE IF EXISTS ${tableName}`);
      console.log(`Dropped table: ${tableName}`);
    }
    
    console.log('All tables dropped successfully');
  } catch (error) {
    console.error('Failed to drop tables:', error);
    throw error;
  }
};
