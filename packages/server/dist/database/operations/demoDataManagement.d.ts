/**
 * Demo database operations - provides built-in sample data for the demo mode
 */
/**
 * Initialize demo positions using the built-in sample dataset.
 * Uses the same logic as the import API but directly.
 */
export declare const initializeDemoPositions: () => Promise<void>;
/**
 * Clear all dynamic cached data (prices, fx rates)
 * Keep only core position data
 */
export declare const clearCachedData: () => Promise<void>;
/**
 * Initialize database with demo data only
 */
export declare const initializeDemoDatabase: () => Promise<void>;
