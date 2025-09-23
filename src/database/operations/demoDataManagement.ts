/**
 * Demo database operations - provides built-in sample data for the demo mode
 */

import { getDbClient } from '../config';
import { createPositionSet } from './positionSetOperations';
import { RawPosition } from '@/types/portfolio';

type BrokerInfo = {
  key: string;
  display: string;
  currency: string;
};

const BROKER_DEFAULT: BrokerInfo = {
  key: 'credit_agricole',
  display: 'Credit Agricole',
  currency: 'EUR'
};

const BROKER_NAME_MAP: Record<string, BrokerInfo> = {
  'credit agricole': BROKER_DEFAULT,
  credit_agricole: BROKER_DEFAULT,
  'credit agricole sa': BROKER_DEFAULT,
  rakuten: {
    key: 'rakuten',
    display: 'Rakuten Securities',
    currency: 'JPY'
  },
  'rakuten securities': {
    key: 'rakuten',
    display: 'Rakuten Securities',
    currency: 'JPY'
  },
  'interactive brokers': {
    key: 'interactive_brokers',
    display: 'Interactive Brokers',
    currency: 'USD'
  },
  interactive_brokers: {
    key: 'interactive_brokers',
    display: 'Interactive Brokers',
    currency: 'USD'
  },
  fidelity: {
    key: 'fidelity',
    display: 'Fidelity',
    currency: 'USD'
  },
  'vanguard': {
    key: 'vanguard',
    display: 'Vanguard',
    currency: 'USD'
  }
};

const resolveBrokerInfo = (brokerName?: string): BrokerInfo => {
  if (!brokerName) {
    return BROKER_DEFAULT;
  }

  const normalized = brokerName.trim().toLowerCase();
  return BROKER_NAME_MAP[normalized] || BROKER_DEFAULT;
};

const ensureBroker = async (
  client: ReturnType<typeof getDbClient>,
  brokerName?: string
): Promise<{ id: number; info: BrokerInfo }> => {
  const baseInfo = resolveBrokerInfo(brokerName);

  const existing = await client.execute({
    sql: `SELECT id, display_name FROM brokers WHERE name = ? LIMIT 1`,
    args: [baseInfo.key]
  });

  if (existing.rows.length > 0) {
    return {
      id: Number(existing.rows[0].id),
      info: {
        ...baseInfo,
        display: String(existing.rows[0].display_name || baseInfo.display)
      }
    };
  }

  const displayName = brokerName?.trim() || baseInfo.display;
  const currency = baseInfo.currency;

  const insert = await client.execute({
    sql: `INSERT INTO brokers (name, display_name, default_currency) VALUES (?, ?, ?)`,
    args: [baseInfo.key, displayName, currency]
  });

  return {
    id: Number(insert.lastInsertRowid),
    info: {
      ...baseInfo,
      display: displayName,
      currency
    }
  };
};

const DEFAULT_DEMO_POSITIONS: RawPosition[] = [
  {
    transactionDate: '2022/03/12',
    ticker: 'AAPL',
    fullName: 'Apple Inc.',
    broker: 'Interactive Brokers',
    account: 'US Margin',
    quantity: 20,
    costPerUnit: 145.25,
    transactionCcy: 'USD',
    stockCcy: 'USD'
  },
  {
    transactionDate: '2022/06/18',
    ticker: 'MSFT',
    fullName: 'Microsoft Corporation',
    broker: 'Interactive Brokers',
    account: 'US Margin',
    quantity: 15,
    costPerUnit: 280.1,
    transactionCcy: 'USD',
    stockCcy: 'USD'
  },
  {
    transactionDate: '2023/01/10',
    ticker: 'VOO',
    fullName: 'Vanguard S&P 500 ETF',
    broker: 'Fidelity',
    account: 'Retirement IRA',
    quantity: 35,
    costPerUnit: 365.4,
    transactionCcy: 'USD',
    stockCcy: 'USD'
  },
  {
    transactionDate: '2023/05/05',
    ticker: 'NVDA',
    fullName: 'Nvidia Corporation',
    broker: 'Interactive Brokers',
    account: 'US Margin',
    quantity: 12,
    costPerUnit: 195.7,
    transactionCcy: 'USD',
    stockCcy: 'USD'
  },
  {
    transactionDate: '2023/07/15',
    ticker: 'TSLA',
    fullName: 'Tesla Inc.',
    broker: 'Interactive Brokers',
    account: 'US Margin',
    quantity: 6,
    costPerUnit: 250,
    transactionCcy: 'USD',
    stockCcy: 'USD'
  },
  {
    transactionDate: '2023/09/01',
    ticker: '7203.T',
    fullName: 'Toyota Motor Corp.',
    broker: 'Rakuten',
    account: 'Japan Cash',
    quantity: 150,
    costPerUnit: 1980,
    transactionCcy: 'JPY',
    stockCcy: 'JPY'
  },
  {
    transactionDate: '2023/09/10',
    ticker: '9433.T',
    fullName: 'Nippon Telegraph & Telephone',
    broker: 'Rakuten',
    account: 'NISA - Growth',
    quantity: 200,
    costPerUnit: 167.2,
    transactionCcy: 'JPY',
    stockCcy: 'JPY'
  },
  {
    transactionDate: '2023/11/20',
    ticker: 'AI.PA',
    fullName: 'Air Liquide SA',
    broker: 'Credit Agricole',
    account: 'PEA',
    quantity: 25,
    costPerUnit: 135.05,
    transactionCcy: 'EUR',
    stockCcy: 'EUR'
  },
  {
    transactionDate: '2024/02/01',
    ticker: 'MC.PA',
    fullName: 'LVMH Moet Hennessy Louis Vuitton',
    broker: 'Credit Agricole',
    account: 'PEA',
    quantity: 8,
    costPerUnit: 820,
    transactionCcy: 'EUR',
    stockCcy: 'EUR'
  },
  {
    transactionDate: '2024/03/28',
    ticker: 'VWCE.DE',
    fullName: 'Vanguard FTSE All-World UCITS ETF',
    broker: 'Vanguard',
    account: 'Global ETF Plan',
    quantity: 18,
    costPerUnit: 105.6,
    transactionCcy: 'EUR',
    stockCcy: 'EUR'
  }
];

/**
 * Initialize demo positions using the built-in sample dataset.
 * Uses the same logic as the import API but directly.
 */
export const initializeDemoPositions = async (): Promise<void> => {
  console.log('📋 Loading built-in demo positions...');
  
  try {
    const positions: RawPosition[] = DEFAULT_DEMO_POSITIONS;
    console.log(`📥 Importing demo position set with ${positions.length} positions from built-in demo dataset...`);
    
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
        const broker = await ensureBroker(client, position.broker);
        const brokerId = broker.id;

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
        const accountName = position.account?.trim() || 'General';

        const accountResult = await client.execute({
          sql: `SELECT id FROM accounts WHERE name = ? AND broker_id = ?`,
          args: [accountName, brokerId]
        });
        
        let accountId: number;
        if (accountResult.rows.length === 0) {
          console.log(`📄 Creating account for ${accountName} (${broker.info.display})`);
          const accountCurrency = position.transactionCcy || broker.info.currency || 'USD';

          const insertAccountResult = await client.execute({
            sql: `INSERT INTO accounts (name, broker_id, base_currency) 
                  VALUES (?, ?, ?)`,
            args: [
              accountName,
              brokerId,
              accountCurrency
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
