/**
 * Database configuration for LibSQL/Turso integration
 * Handles connection settings and environment variables
 */
import { Client } from '@libsql/client';
/**
 * Get or create the database client instance
 * @returns {Client} LibSQL client instance
 */
export declare const getDbClient: () => Client;
/**
 * Close the database connection
 */
export declare const closeDbConnection: () => Promise<void>;
/**
 * Test database connectivity
 * @returns {Promise<boolean>} True if connection successful
 */
export declare const testDbConnection: () => Promise<boolean>;
