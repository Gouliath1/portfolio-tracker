# Turso Cloud Database Setup (Phase 1)

This guide walks you through setting up Turso cloud database for the mobile app.

## Why Turso for Phase 1?

As documented in `REACT_NATIVE_DATABASE.md`, we're using a two-phase approach:
- **Phase 1 (Current)**: Turso cloud database - quick setup for testing and UI development
- **Phase 2 (Future)**: expo-sqlite migration for production offline support

## Prerequisites

- Turso CLI (recommended) or web dashboard access
- Existing local database at `/data/portfolio.db` (for migration)

## Step 1: Create Turso Account

1. Visit https://turso.tech
2. Sign up for a free account (generous free tier included)
3. Verify your email

## Step 2: Install Turso CLI (Recommended)

```bash
# macOS/Linux
curl -sSfL https://get.tur.so/install.sh | bash

# Or via Homebrew
brew install tursodatabase/tap/turso
```

Verify installation:
```bash
turso --version
```

## Step 3: Authenticate CLI

```bash
turso auth login
```

This will open your browser to complete authentication.

## Step 4: Create Database

```bash
# Create a new database named 'portfolio-tracker'
turso db create portfolio-tracker

# Get database URL
turso db show portfolio-tracker --url

# Create authentication token
turso db tokens create portfolio-tracker
```

Save both the URL and token - you'll need them in the next step.

Example output:
```
Database URL: libsql://portfolio-tracker-yourname.turso.io
Auth Token: eyJhbGc....(long token string)
```

## Step 5: Configure Mobile App Environment

1. Navigate to the mobile app directory:
```bash
cd apps/mobile
```

2. Copy the example environment file:
```bash
cp .env.example .env
```

3. Edit `.env` and add your Turso credentials:
```bash
TURSO_DATABASE_URL=libsql://portfolio-tracker-yourname.turso.io
TURSO_AUTH_TOKEN=eyJhbGc....(your actual token)
```

**Important**: The `.env` file is gitignored for security. Never commit credentials to version control.

## Step 6: Initialize Database Schema

The database needs the same schema as your local database. You have two options:

### Option A: Using Turso CLI (Recommended)

If you have an existing local database with data:

```bash
# From project root
turso db shell portfolio-tracker < packages/server/db/schema.sql
```

If you have a schema.sql file, or you can export your current schema:

```bash
# Export schema from local database (if using sqlite3)
sqlite3 data/portfolio.db .schema > schema.sql

# Import to Turso
turso db shell portfolio-tracker < schema.sql
```

### Option B: Using Migration Scripts

If your project has migration scripts, run them against Turso:

```bash
# Set environment variables temporarily
export TURSO_DATABASE_URL="libsql://portfolio-tracker-yourname.turso.io"
export TURSO_AUTH_TOKEN="your-auth-token"

# Run migrations (adjust command based on your setup)
npm run migrate
# or
pnpm run migrate
```

## Step 7: Migrate Data (Optional)

If you have existing data in your local database, you can migrate it:

### Using Turso CLI

```bash
# Export data from local database
sqlite3 data/portfolio.db .dump > data_dump.sql

# Import to Turso (skip schema creation if already done)
turso db shell portfolio-tracker < data_dump.sql
```

### Using Custom Migration Script

You can also write a Node.js script to copy data:

```typescript
import { createClient } from '@libsql/client';
import fs from 'fs';

// Local database
const localDb = createClient({
  url: 'file:./data/portfolio.db'
});

// Turso database
const tursoDb = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!
});

// Copy data table by table
// ... migration logic ...
```

## Step 8: Test Connection

Create a simple test script to verify the connection:

```typescript
// test-turso.ts
import { createClient } from '@libsql/client';
import dotenv from 'dotenv';

dotenv.config({ path: './apps/mobile/.env' });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!
});

async function test() {
  try {
    const result = await client.execute('SELECT 1 as test');
    console.log('✅ Connection successful:', result.rows);

    // Check for tables
    const tables = await client.execute(`
      SELECT name FROM sqlite_master WHERE type='table' ORDER BY name
    `);
    console.log('📊 Tables:', tables.rows);
  } catch (error) {
    console.error('❌ Connection failed:', error);
  }
}

test();
```

Run it:
```bash
npx tsx test-turso.ts
```

## Step 9: Start Mobile App

The database configuration in `/packages/server/src/database/config.ts` automatically detects the Turso environment variables and uses them:

```typescript
if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
  dbClient = createClient({
    url: config.url,
    authToken: config.authToken,
  });
  console.log('Connected to Turso cloud database');
}
```

Start the app:
```bash
cd apps/mobile
npx expo start --clear --ios
```

You should see in the logs:
```
Connected to Turso cloud database
```

## Step 10: Verify Functionality

Test all portfolio features:
- [ ] Portfolio summary displays correctly
- [ ] Positions list loads
- [ ] Price updates work
- [ ] FX rates fetch correctly
- [ ] Can add/edit positions
- [ ] Can refresh data

## Troubleshooting

### "Failed to connect to Turso"

1. Verify credentials in `.env`:
   ```bash
   cat apps/mobile/.env
   ```
2. Test token is valid:
   ```bash
   turso db tokens validate portfolio-tracker YOUR_TOKEN
   ```
3. Check database exists:
   ```bash
   turso db list
   ```

### "Table does not exist"

Schema wasn't initialized. Run Step 6 again.

### "Environment variables not found"

Expo CLI needs to be restarted to pick up new `.env` files:
```bash
# Kill all expo processes
lsof -ti:8090 | xargs kill -9

# Restart with cache clear
npx expo start --clear
```

### "Data not showing in app"

1. Check if tables have data:
   ```bash
   turso db shell portfolio-tracker "SELECT COUNT(*) FROM positions"
   ```
2. If empty, run Step 7 to migrate data

## Turso Dashboard

Access your database via web dashboard:
1. Visit https://app.turso.tech
2. Select your database
3. Use SQL editor to query/modify data
4. View usage metrics and logs

## Monitoring Usage

Check your Turso usage:
```bash
turso db show portfolio-tracker
```

Free tier includes:
- 9 GB storage
- 500 databases
- Unlimited queries for development

## Next Steps

Once Phase 1 is working and you've built out the mobile UI:
1. Review `REACT_NATIVE_DATABASE.md` for Phase 2 (expo-sqlite) migration plan
2. Implement expo-sqlite adapter for offline support
3. Test data persistence and offline functionality

## Security Notes

- **Never commit** `.env` files to git
- **Rotate tokens** periodically via `turso db tokens create`
- **Use separate databases** for development/production
- Consider **IP restrictions** in Turso settings for production

## Useful Turso Commands

```bash
# List all databases
turso db list

# Show database info
turso db show portfolio-tracker

# Access SQL shell
turso db shell portfolio-tracker

# Create new token
turso db tokens create portfolio-tracker

# Invalidate old token
turso db tokens revoke portfolio-tracker TOKEN_NAME

# Destroy database (CAREFUL!)
turso db destroy portfolio-tracker
```

## References

- [Turso Documentation](https://docs.turso.tech/)
- [Turso CLI Reference](https://docs.turso.tech/reference/turso-cli)
- [@libsql/client Documentation](https://github.com/libsql/libsql-client-ts)
- [React Native Database Approach](./REACT_NATIVE_DATABASE.md)
