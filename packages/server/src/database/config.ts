/**
 * Database configuration for LibSQL/Turso integration
 * Handles connection settings and environment variables
 */

import { createClient, Client } from '@libsql/client';

// Avoid static imports of Node.js modules to keep React Native compatible
type FsModule = any;
type PathModule = any;

let cachedFs: FsModule | null | undefined;
let cachedPath: PathModule | null | undefined;

const loadPath = (): PathModule | null => {
  if (cachedPath !== undefined) {
    return cachedPath;
  }

  if (typeof process === 'undefined' || !process.versions?.node) {
    cachedPath = null;
    return cachedPath;
  }

  try {
    const req = Function('return require')() as NodeJS.Require;
    cachedPath = req('path') as PathModule;
    return cachedPath;
  } catch {
    cachedPath = null;
    return cachedPath;
  }
};

const loadFs = (): FsModule | null => {
  if (cachedFs !== undefined) {
    return cachedFs;
  }

  if (typeof process === 'undefined' || !process.versions?.node) {
    cachedFs = null;
    return cachedFs;
  }

  try {
    const req = Function('return require')() as NodeJS.Require;
    cachedFs = req('fs') as FsModule;
    return cachedFs;
  } catch {
    cachedFs = null;
    return cachedFs;
  }
};

// Database connection configuration
interface DatabaseConfig {
  url?: string;
  authToken?: string;
  localPath?: string;
}

// Environment-based configuration
const getDbConfig = (): DatabaseConfig => {
  const config: DatabaseConfig = {};

  // Debug: Log environment variables
  console.log('[getDbConfig] Environment variables:', {
    EXPO_PUBLIC_TURSO_DATABASE_URL: process.env.EXPO_PUBLIC_TURSO_DATABASE_URL,
    EXPO_PUBLIC_TURSO_AUTH_TOKEN: process.env.EXPO_PUBLIC_TURSO_AUTH_TOKEN ? 'SET' : 'NOT SET',
    TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL,
    TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN ? 'SET' : 'NOT SET',
    DATABASE_PATH: process.env.DATABASE_PATH,
  });

  // Check for Turso cloud configuration
  // Try EXPO_PUBLIC_ prefixed variables first (for React Native), then fall back to non-prefixed (for Node.js)
  const tursoUrl = process.env.EXPO_PUBLIC_TURSO_DATABASE_URL || process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.EXPO_PUBLIC_TURSO_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN;

  if (tursoUrl && tursoToken) {
    config.url = tursoUrl;
    config.authToken = tursoToken;
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
  const isReactNative = typeof process === 'undefined' || !process.versions?.node;

  console.log('[getDbClient] Called, dbClient exists:', !!dbClient, ', isReactNative:', isReactNative);

  // Force reset if environment doesn't match
  if (dbClient && isReactNative) {
    const clientStr = JSON.stringify(dbClient);
    if (clientStr.includes('file:')) {
      console.log('[getDbClient] Resetting file-based client for React Native');
      dbClient = null;
    }
  }

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
      // Check if we're in React Native environment
      const isReactNative = typeof process === 'undefined' || !process.versions?.node;

      console.log('[DB Config] Environment check:', {
        hasProcess: typeof process !== 'undefined',
        processVersionsNode: process?.versions?.node,
        isReactNative,
        localPath: config.localPath
      });

      if (isReactNative) {
        // React Native: Use in-memory database
        // Note: This means data won't persist between app restarts
        dbClient = createClient({
          url: ':memory:',
        });
        console.log('Connected to in-memory SQLite database (React Native)');
      } else {
        // Node.js: Connect to local SQLite file
        // Ensure the directory exists (only in Node.js environment)
        const path = loadPath();
        const fs = loadFs();
        if (path && fs) {
          const dbDir = path.dirname(config.localPath);
          try {
            fs.mkdirSync(dbDir, { recursive: true });
          } catch {
            // Directory might already exist, ignore error
          }
        }

        dbClient = createClient({
          url: `file:${config.localPath}`,
        });
        console.log(`Connected to local SQLite database: ${config.localPath}`);
      }
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
