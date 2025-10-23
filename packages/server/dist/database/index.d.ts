/**
 * Database utilities entry point
 * Exports all database functionality for easy import
 */
export { getDbClient, closeDbConnection, testDbConnection } from './config';
export { initializeDatabase, insertDefaultData, setupDatabase, dropAllTables } from './schema';
export { initializeDemoPositions, clearCachedData, initializeDemoDatabase } from './operations/demoDataManagement';
export { getAllPositionSets, getActivePositionSet, createPositionSet, setActivePositionSet, isUsingDemoData, getPositionSetPositionCount, deletePositionSet } from './operations/positionSetOperations';
export { getFxRate, storeFxRate, migrateFxRatesFromJson } from './operations/fxRateOperations';
export { initializeDatabaseOnStartup } from './startup';
export { getHistoricalPricesForSymbol, getTodaysPrice, storePriceData, storeHistoricalPrices, getAllHistoricalPrices } from './operations/priceOperations';
export { getPositionsForSet, getPositionsForActiveSet } from './operations/positionsOperations';
export { getHistoricalDataStatus } from './operations/historicalDataOperations';
export type { Client } from '@libsql/client';
