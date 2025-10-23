# Turso Quick Start Guide

Get your mobile app running with Turso cloud database in 5 minutes.

## Prerequisites

- Turso CLI installed: `brew install tursodatabase/tap/turso`
- Turso account (free): https://turso.tech

## Quick Setup

### 1. Create Database (2 minutes)

```bash
# Login to Turso
turso auth login

# Create database
turso db create portfolio-tracker

# Get credentials (save these!)
turso db show portfolio-tracker --url
turso db tokens create portfolio-tracker
```

### 2. Configure Mobile App (1 minute)

```bash
# Copy environment template
cd apps/mobile
cp .env.example .env
```

Edit `apps/mobile/.env` with your credentials:

```bash
TURSO_DATABASE_URL=libsql://portfolio-tracker-yourname.turso.io
TURSO_AUTH_TOKEN=eyJhbGc....(your actual token)
```

### 3. Initialize Database Schema (1 minute)

```bash
# From project root
npx tsx --env-file=apps/mobile/.env scripts/init-turso.ts
```

Expected output:
```
🚀 Initializing Turso database...

Initializing database schema...
Creating table: brokers
Creating table: currencies
Creating table: accounts
Creating table: securities
Creating table: position_sets
Creating table: positions
Creating table: securities_prices
Creating table: fx_rates
Database schema created successfully
Inserting default reference data...
Default reference data inserted successfully
Database setup completed successfully

✅ Database initialized successfully!
```

### 4. Start Mobile App (1 minute)

```bash
cd apps/mobile
npx expo start --clear --ios
```

You should see in the console:
```
Connected to Turso cloud database
```

## Verify Setup

Test your database connection:

```bash
# List all tables
turso db shell portfolio-tracker "SELECT name FROM sqlite_master WHERE type='table'"

# Check currencies were inserted
turso db shell portfolio-tracker "SELECT code, name FROM currencies"

# Check brokers were inserted
turso db shell portfolio-tracker "SELECT display_name FROM brokers"
```

Expected tables:
- brokers
- currencies
- accounts
- securities
- position_sets
- positions
- securities_prices
- fx_rates

## Add Your Portfolio Data

### Option 1: Import from JSON

If you have a `data/positions.json` file:

```bash
# From Next.js web app, use the import endpoint
curl -X POST http://localhost:3000/api/admin/positions/import
```

### Option 2: Add via Web App

1. Start web app with Turso credentials:
```bash
cd apps/web
TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npm run dev
```

2. Navigate to http://localhost:3000
3. Use the import functionality

### Option 3: Add via Mobile App

Once the mobile app is running, you can use it to add positions directly!

## Troubleshooting

### "Failed to connect"

Check your credentials:
```bash
cat apps/mobile/.env
```

Verify token is valid:
```bash
turso db tokens validate portfolio-tracker YOUR_TOKEN
```

### "Table does not exist"

Run the initialization script again:
```bash
npx tsx --env-file=apps/mobile/.env scripts/init-turso.ts
```

### "Environment variables not loaded"

Make sure to restart Expo when you modify `.env`:
```bash
lsof -ti:8090 | xargs kill -9
npx expo start --clear
```

## Next Steps

- [ ] Add your portfolio positions
- [ ] Test all mobile app features
- [ ] Continue building mobile UI (Phase 2-5)
- [ ] Plan expo-sqlite migration for offline support

## Need More Details?

See the comprehensive guide: [TURSO_SETUP.md](./TURSO_SETUP.md)
