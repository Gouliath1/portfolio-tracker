/**
 * Database schema definitions and initialization
 * Creates all tables according to 2NF design
 */
/**
 * Initialize the database schema
 * @returns {Promise<void>}
 */
export declare const initializeDatabase: () => Promise<void>;
/**
 * Insert default reference data
 * @returns {Promise<void>}
 */
export declare const insertDefaultData: () => Promise<void>;
/**
 * Full database setup (schema + default data)
 * @returns {Promise<void>}
 */
export declare const setupDatabase: () => Promise<void>;
/**
 * Drop all tables (for testing/reset purposes)
 * @returns {Promise<void>}
 */
export declare const dropAllTables: () => Promise<void>;
