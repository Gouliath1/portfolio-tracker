/**
 * Database operations for historical prices
 * Replaces positionsPrices.json functionality
 */

import { getDbClient } from '../config';

export interface PriceData {
  symbol: string;
  date: string;
  price: number;
}

export interface HistoricalPricesData {
  [symbol: string]: {
    [date: string]: number;
  };
}

/**
 * Get all historical prices for a symbol
 * @param symbol Stock ticker symbol
 * @returns Historical prices object
 */
export const getHistoricalPricesForSymbol = async (symbol: string): Promise<{ [date: string]: number }> => {
  const client = getDbClient();
  
  try {
    // First, get or create security
    const securityResult = await client.execute({
      sql: 'SELECT id FROM securities WHERE ticker = ?',
      args: [symbol]
    });

    if (securityResult.rows.length === 0) {
      // Create security if it doesn't exist
      await client.execute({
        sql: 'INSERT INTO securities (ticker, name, security_type) VALUES (?, ?, ?)',
        args: [symbol, symbol, 'stock']
      });
      
      return {}; // No historical data yet
    }

    const securityId = Number(securityResult.rows[0].id);

    // Get historical prices
    const pricesResult = await client.execute({
      sql: `SELECT price_date, close_price 
            FROM securities_prices 
            WHERE security_id = ? 
            ORDER BY price_date DESC`,
      args: [securityId]
    });

    const prices: { [date: string]: number } = {};
    for (const row of pricesResult.rows) {
      prices[String(row.price_date)] = Number(row.close_price);
    }

    return prices;

  } catch (error) {
    console.error(`Error getting historical prices for ${symbol}:`, error);
    return {};
  }
};

/**
 * Get today's price for a symbol
 * @param symbol Stock ticker symbol
 * @returns Today's price or null if not found
 */
export const getTodaysPrice = async (symbol: string): Promise<number | null> => {
  const today = new Date().toISOString().split('T')[0];
  const prices = await getHistoricalPricesForSymbol(symbol);
  return prices[today] || null;
};

/**
 * Store a single price in the database
 * @param symbol Stock ticker symbol
 * @param date Price date (YYYY-MM-DD)
 * @param price Price value
 */
export const storePriceData = async (symbol: string, date: string, price: number): Promise<void> => {
  const client = getDbClient();
  
  try {
    // Get or create security
    const securityResult = await client.execute({
      sql: 'SELECT id FROM securities WHERE ticker = ?',
      args: [symbol]
    });

    let securityId: number;
    if (securityResult.rows.length === 0) {
      // Create security if it doesn't exist
      const insertResult = await client.execute({
        sql: 'INSERT INTO securities (ticker, name, security_type) VALUES (?, ?, ?)',
        args: [symbol, symbol, 'stock']
      });
      securityId = Number(insertResult.lastInsertRowid);
    } else {
      securityId = Number(securityResult.rows[0].id);
    }

    // Insert or update price
    await client.execute({
      sql: `INSERT OR REPLACE INTO securities_prices 
            (security_id, price_date, close_price) 
            VALUES (?, ?, ?)`,
      args: [securityId, date, price]
    });

  } catch (error) {
    console.error(`Error storing price for ${symbol}:`, error);
    throw error;
  }
};

/**
 * Store multiple prices for a symbol
 * @param symbol Stock ticker symbol  
 * @param prices Object with date -> price mapping
 */
export const storeHistoricalPrices = async (symbol: string, prices: { [date: string]: number }): Promise<void> => {
  const client = getDbClient();
  
  try {
    await client.execute('BEGIN TRANSACTION');

    // Get or create security
    const securityResult = await client.execute({
      sql: 'SELECT id FROM securities WHERE ticker = ?',
      args: [symbol]
    });

    let securityId: number;
    if (securityResult.rows.length === 0) {
      const insertResult = await client.execute({
        sql: 'INSERT INTO securities (ticker, name, security_type) VALUES (?, ?, ?)',
        args: [symbol, symbol, 'stock']
      });
      securityId = Number(insertResult.lastInsertRowid);
    } else {
      securityId = Number(securityResult.rows[0].id);
    }

    // Insert all prices
    for (const [date, price] of Object.entries(prices)) {
      await client.execute({
        sql: `INSERT OR REPLACE INTO securities_prices 
              (security_id, price_date, close_price) 
              VALUES (?, ?, ?)`,
        args: [securityId, date, price]
      });
    }

    await client.execute('COMMIT');
    console.log(`✅ Stored ${Object.keys(prices).length} prices for ${symbol}`);

  } catch (error) {
    await client.execute('ROLLBACK');
    console.error(`Error storing historical prices for ${symbol}:`, error);
    throw error;
  }
};

/**
 * Get all cached prices in the old JSON format for compatibility
 * @returns HistoricalPricesData object matching the old JSON structure
 */
export const getAllHistoricalPrices = async (): Promise<HistoricalPricesData> => {
  const client = getDbClient();
  
  try {
    const result = await client.execute(`
      SELECT s.ticker, hp.price_date, hp.close_price
      FROM securities_prices hp
      JOIN securities s ON hp.security_id = s.id
      ORDER BY s.ticker, hp.price_date DESC
    `);

    const data: HistoricalPricesData = {};
    
    for (const row of result.rows) {
      const symbol = String(row.ticker);
      const date = String(row.price_date);
      const price = Number(row.close_price);
      
      if (!data[symbol]) {
        data[symbol] = {};
      }
      data[symbol][date] = price;
    }

    return data;

  } catch (error) {
    console.error('Error getting all historical prices:', error);
    return {};
  }
};
