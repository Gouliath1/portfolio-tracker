import { getDbClient } from '../config';

export interface FxRateRecord {
    from_currency: string;
    to_currency: string;
    rate_date: string;
    rate: number;
    created_at: string;
}

/**
 * Get FX rate for a currency pair on a specific date (or closest available date)
 */
export async function getFxRate(
    fxPair: string, 
    requestedDate?: string
): Promise<{
    rate: number | null;
    date: string | null;
    requestedDate?: string;
    pair: string;
} | null> {
    const db = await getDbClient();
    
    // Parse currency pair (e.g., "USDJPY" -> from="USD", to="JPY")
    if (fxPair.length !== 6) {
        return { rate: null, date: null, requestedDate, pair: fxPair };
    }
    
    const fromCurrency = fxPair.substring(0, 3);
    const toCurrency = fxPair.substring(3, 6);
    
    try {
        if (requestedDate) {
            // Find closest date match
            const result = await db.execute({
                sql: `SELECT rate, rate_date, 
                             ABS(julianday(rate_date) - julianday(?)) as date_diff
                      FROM fx_rates 
                      WHERE from_currency = ? AND to_currency = ?
                      ORDER BY date_diff ASC, rate_date DESC
                      LIMIT 1`,
                args: [requestedDate, fromCurrency, toCurrency]
            });
            
            if (result.rows.length > 0) {
                const row = result.rows[0];
                return {
                    rate: row.rate as number,
                    date: row.rate_date as string,
                    requestedDate,
                    pair: fxPair
                };
            }
        } else {
            // Get most recent rate
            const result = await db.execute({
                sql: `SELECT rate, rate_date 
                      FROM fx_rates 
                      WHERE from_currency = ? AND to_currency = ?
                      ORDER BY rate_date DESC
                      LIMIT 1`,
                args: [fromCurrency, toCurrency]
            });
            
            if (result.rows.length > 0) {
                const row = result.rows[0];
                return {
                    rate: row.rate as number,
                    date: row.rate_date as string,
                    pair: fxPair
                };
            }
        }
        
        return { rate: null, date: null, requestedDate, pair: fxPair };
        
    } catch (error) {
        console.error('Error fetching FX rate from database:', error);
        throw error;
    }
}

/**
 * Store FX rate in the database
 */
export async function storeFxRate(
    fxPair: string,
    rate: number,
    rateDate?: string
): Promise<void> {
    const db = await getDbClient();
    
    // Parse currency pair
    if (fxPair.length !== 6) {
        throw new Error(`Invalid FX pair format: ${fxPair}. Expected format: USDEUR`);
    }
    
    const fromCurrency = fxPair.substring(0, 3);
    const toCurrency = fxPair.substring(3, 6);
    const dateToUse = rateDate || new Date().toISOString().split('T')[0];
    
    try {
        // Insert or replace the FX rate
        await db.execute({
            sql: `INSERT OR REPLACE INTO fx_rates 
                  (from_currency, to_currency, rate_date, rate, created_at) 
                  VALUES (?, ?, ?, ?, datetime('now'))`,
            args: [fromCurrency, toCurrency, dateToUse, rate]
        });
        
        console.log(`📈 Stored FX rate: ${fxPair} = ${rate} on ${dateToUse}`);
        
    } catch (error) {
        console.error('Error storing FX rate in database:', error);
        throw error;
    }
}

/**
 * Get all FX rates for a currency pair
 */
export async function getAllFxRatesForPair(fxPair: string): Promise<{[date: string]: number}> {
    const db = await getDbClient();
    
    if (fxPair.length !== 6) {
        return {};
    }
    
    const fromCurrency = fxPair.substring(0, 3);
    const toCurrency = fxPair.substring(3, 6);
    
    try {
        const result = await db.execute({
            sql: `SELECT rate_date, rate 
                  FROM fx_rates 
                  WHERE from_currency = ? AND to_currency = ?
                  ORDER BY rate_date DESC`,
            args: [fromCurrency, toCurrency]
        });
        
        const rates: {[date: string]: number} = {};
        for (const row of result.rows) {
            rates[row.rate_date as string] = row.rate as number;
        }
        
        return rates;
        
    } catch (error) {
        console.error('Error fetching all FX rates for pair:', error);
        throw error;
    }
}

/**
 * Migrate FX rates from JSON file to database (for migration purposes)
 */
export async function migrateFxRatesFromJson(jsonData: Record<string, Record<string, number>>): Promise<void> {
    console.log('🔄 Starting FX rates migration to database...');
    let totalRates = 0;
    
    try {
        for (const fxPair in jsonData) {
            const rates = jsonData[fxPair];
            
            for (const date in rates) {
                const rate = rates[date];
                await storeFxRate(fxPair, rate, date);
                totalRates++;
            }
        }
        
        console.log(`✅ Successfully migrated ${totalRates} FX rates to database`);
        
    } catch (error) {
        console.error('Error migrating FX rates:', error);
        throw error;
    }
}
