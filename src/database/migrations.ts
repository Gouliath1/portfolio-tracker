// Database migrations
import { getDbClient } from './config';

export async function runMigrations(): Promise<void> {
    try {
        console.log('🔄 Running database migrations...');
        
        // Migration 1: Rename historical_prices to securities_prices
        await migrateHistoricalPricesToSecuritiesPrices();
        
        console.log('✅ Database migrations completed');
    } catch (error) {
        console.error('❌ Error running migrations:', error);
        throw error;
    }
}

async function migrateHistoricalPricesToSecuritiesPrices(): Promise<void> {
    const client = getDbClient();
    
    try {
        // Check if historical_prices table exists
        const tableCheck = await client.execute(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='historical_prices'
        `);
        
        if (tableCheck.rows.length > 0) {
            console.log('🔄 Migrating historical_prices table to securities_prices...');
            
            // Rename the table (SQLite supports this)
            await client.execute(`
                ALTER TABLE historical_prices RENAME TO securities_prices
            `);
            
            console.log('✅ Table renamed from historical_prices to securities_prices');
        } else {
            console.log('ℹ️ historical_prices table not found, no migration needed');
        }
    } catch (error) {
        console.error('❌ Error migrating historical_prices to securities_prices:', error);
        throw error;
    }
}
