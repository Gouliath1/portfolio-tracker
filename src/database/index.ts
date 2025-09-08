/**
 * Database utilities entry point
 * Exports all database functionality for easy import
 */

// Configuration and connection
export { 
  getDbClient, 
  closeDbConnection, 
  testDbConnection 
} from './config';

// Schema management
export { 
  initializeDatabase, 
  insertDefaultData, 
  setupDatabase, 
  dropAllTables 
} from './schema';

// Demo data setup
export { 
  initializeDemoPositions,
  clearCachedData,
  initializeDemoDatabase
} from './operations/demoDataManagement';

// Price operations
export {
  getHistoricalPricesForSymbol,
  getTodaysPrice,
  storePriceData,
  storeHistoricalPrices,
  getAllHistoricalPrices
} from './operations/priceOperations';

// Re-export types for convenience
export type { Client } from '@libsql/client';
