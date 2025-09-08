/**
 * Database configuration for LibSQL/Turso integration
 * Handles connection settings and environment variables
 */

import { createClient, Client } from '@libsql/client';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

// Database connection configuration
interface DatabaseConfig {
  url?: string;
  authToken?: string;
  localPath?: string;
}

// Environment-based configuration
const getDbConfig = (): DatabaseConfig => {
  const config: DatabaseConfig = {};

  // Check for Turso cloud configuration
  if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
    config.url = process.env.TURSO_DATABASE_URL;
    config.authToken = process.env.TURSO_AUTH_TOKEN;
  } else {
    // Fall back to local SQLite file
    config.localPath = process.env.DATABASE_PATH || './data/portfolio.db';
  }

  return config;
};

// Global database client instance
let dbClient: Client | null = null;

/**
 * Get or create the database client instance
 * @returns {Client} LibSQL client instance
 */
export const getDbClient = (): Client => {
  if (!dbClient) {
    const config = getDbConfig();
    
    if (config.url && config.authToken) {
      // Connect to Turso cloud
      dbClient = createClient({
        url: config.url,
        authToken: config.authToken,
      });
      console.log('Connected to Turso cloud database');
    } else if (config.localPath) {
      // Connect to local SQLite file
      // Ensure the directory exists
      const dbDir = dirname(config.localPath);
      try {
        mkdirSync(dbDir, { recursive: true });
      } catch {
        // Directory might already exist, ignore error
      }
      
      dbClient = createClient({
        url: `file:${config.localPath}`,
      });
      console.log(`Connected to local SQLite database: ${config.localPath}`);
    } else {
      throw new Error('No valid database configuration found');
    }
  }

  return dbClient;
};

/**
 * Close the database connection
 */
export const closeDbConnection = async (): Promise<void> => {
  if (dbClient) {
    await dbClient.close();
    dbClient = null;
    console.log('Database connection closed');
  }
};

/**
 * Test database connectivity
 * @returns {Promise<boolean>} True if connection successful
 */
export const testDbConnection = async (): Promise<boolean> => {
  try {
    const client = getDbClient();
    await client.execute('SELECT 1');
    return true;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
};
