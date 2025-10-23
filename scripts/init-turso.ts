#!/usr/bin/env npx tsx
/**
 * Initialize Turso database with schema and default data
 *
 * Usage:
 *   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npx tsx scripts/init-turso.ts
 */

import { setupDatabase } from '../packages/server/src/database/schema';

async function main() {
  console.log('🚀 Initializing Turso database...\n');

  // Check for required environment variables
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    console.error('❌ Error: Missing required environment variables');
    console.error('\nRequired:');
    console.error('  TURSO_DATABASE_URL - Your Turso database URL');
    console.error('  TURSO_AUTH_TOKEN - Your Turso authentication token');
    console.error('\nUsage:');
    console.error('  TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npx tsx scripts/init-turso.ts');
    console.error('\nOr set them in apps/mobile/.env and run:');
    console.error('  npx tsx --env-file=apps/mobile/.env scripts/init-turso.ts');
    process.exit(1);
  }

  console.log('Database URL:', process.env.TURSO_DATABASE_URL);
  console.log('Auth Token:', process.env.TURSO_AUTH_TOKEN.substring(0, 20) + '...\n');

  try {
    await setupDatabase();
    console.log('\n✅ Database initialized successfully!');
    console.log('\nYou can now:');
    console.log('  1. Start the mobile app: cd apps/mobile && npx expo start --clear --ios');
    console.log('  2. View your database: turso db shell <database-name>');
    console.log('  3. Check tables: turso db shell <database-name> "SELECT name FROM sqlite_master WHERE type=\'table\'"');
  } catch (error) {
    console.error('\n❌ Failed to initialize database:', error);
    process.exit(1);
  }
}

main();
