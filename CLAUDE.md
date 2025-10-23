# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Turborepo Monorepo Structure

This is a Turborepo-based monorepo with the following workspace architecture:

### Applications (`apps/`)
- **`apps/web`** - Next.js 15 application (App Router) serving the portfolio tracker web UI
  - Uses Next.js standalone build for production
  - Automatic database initialization via `instrumentation.ts` on server startup
  - API routes are thin wrappers that call shared service layer
- **`apps/mobile`** - Expo/React Native mobile application (starter, not fully implemented)

### Shared Packages (`packages/`)
- **`@portfolio/types`** - Shared TypeScript type definitions for the entire monorepo
- **`@portfolio/utils`** - Cross-platform utilities (e.g., `getDataPath()` for finding the data directory)
- **`@portfolio/core`** - Business logic (currency conversion, P&L calculations, Yahoo Finance API client, charting utilities)
  - Contains `yahooFinanceApi.ts` for fetching stock prices and FX rates
  - Price and FX rate caching logic (`priceCache.ts`, `fxRateCache.ts`)
  - Portfolio calculation functions (`calculations.ts`, `returnCalculations.ts`)
  - Historical portfolio calculations and charting data preparation
- **`@portfolio/server`** - Database layer + shared service orchestration
  - Database: SQLite via `@libsql/client` stored in `data/portfolio.db`
  - Services in `src/services/`: `portfolioService`, `priceService`, `fxRateService`, `positionsAdminService`, `positionSetsService`, `historicalDataService`
  - Database operations in `src/database/operations/`
  - Covered by Jest unit tests in `packages/server/__tests__/`

### Dependency Flow
```
apps/web → @portfolio/server → @portfolio/core → @portfolio/types
                             ↘ @portfolio/utils ↗
apps/mobile → @portfolio/core → @portfolio/types
                             ↘ @portfolio/utils ↗
```

## Essential Commands

### Development
```bash
# Start web app (from repo root)
npm run dev:web

# Start both web + mobile (with simulator)
npm run dev

# Start only mobile (requires iOS simulator tooling)
npm run dev:mobile
```

### Building
```bash
# Build all packages and apps
npm run build

# Build only shared packages (types, utils, core, server)
npm run build:packages

# Build only web app
npm run build:web

# Build only mobile app (boots simulator)
npm run build:mobile
```

### Testing
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage (70% threshold enforced)
npm run test:coverage

# CI mode (no watch, with coverage)
npm run test:ci
```

### Linting
```bash
# Lint all workspaces
npm run lint
```

### Production
```bash
# Start production Next.js server
npm run start
```

## Key Architecture Patterns

### Service Layer Pattern
All database access is abstracted into service modules in `packages/server/src/services/`. Next.js API routes should remain thin and delegate to these services. This enables code reuse between web and mobile clients.

Example:
```typescript
// ✅ Good - API route calls shared service
import { getActivePortfolioSnapshot } from '@portfolio/server';
export async function GET() {
  const snapshot = await getActivePortfolioSnapshot({ forceRefresh: false });
  return NextResponse.json(snapshot);
}

// ❌ Bad - API route does direct database access
import { getDbClient } from '@portfolio/server';
export async function GET() {
  const db = getDbClient();
  const positions = await db.execute('SELECT * FROM positions');
  // ... manual calculations ...
}
```

### Database Initialization
The database is automatically initialized on Next.js server startup via the `instrumentation.ts` file, which calls `initializeDatabaseOnStartup()` from `@portfolio/server`. This runs schema creation and loads demo positions if the database is fresh (no existing positions).

### Price Caching
Stock prices and FX rates are cached using a smart caching system in `@portfolio/core`:
- `getCachedPrice()` / `updatePriceCache()` for stock prices
- `getCachedFxRate()` / `updateFxRateCache()` for currency exchange rates
- Daily cache expiration to minimize Yahoo Finance API calls
- Rate limiting: 100ms minimum delay between Yahoo Finance requests

### Portfolio Data Files
- `data/positions.json` - User's actual portfolio positions (gitignored for privacy)
- SQLite database at `data/portfolio.db` (created automatically on startup)
- Demo data loaded only if database is empty

### Multi-Currency Support
Base currency is JPY (defined in `yahooFinanceApi.ts`). All portfolio valuations are converted to JPY. Supports:
- US stocks (e.g., `AAPL`, `GOOGL`)
- Japanese stocks (e.g., `7203.T`, `6758.T`)

## Working with Shared Packages

All packages in `packages/` must be built before use by applications. Turborepo handles dependency ordering automatically.

### Modifying Shared Packages
When changing code in `@portfolio/types`, `@portfolio/utils`, `@portfolio/core`, or `@portfolio/server`:
1. Run `npm run build:packages` to compile TypeScript
2. Or rely on Turborepo's `^build` dependency chain during `npm run dev` or `npm run build`

### Import Paths
Use the package aliases defined in `tsconfig.base.json`:
```typescript
import { RawPosition } from '@portfolio/types';
import { getActivePositions } from '@portfolio/server';
import { calculatePortfolioSummary } from '@portfolio/core';
import { getDataPath } from '@portfolio/utils';
```

## Testing Strategy

Jest is configured at the monorepo root (`jest.config.js`). Tests can be placed:
- In `packages/**/__tests__/` for shared package tests
- In `apps/web/src/**/__tests__/` for web-specific tests
- Or co-located as `*.test.ts` files

Service layer tests (`packages/server/__tests__/*Service.test.ts`) ensure shared business logic is correct.

Coverage thresholds: 70% branches, functions, lines, statements.

## Production Deployment

The Next.js standalone build creates a self-contained production package at `apps/web/.next/standalone/`:
- Includes only runtime dependencies
- Database initialization happens automatically on server start
- Ensure `data/` directory exists and contains `positions.json`
- Deploy using Node.js, Docker, or PM2 (see README for details)

Default port: 3000 (configurable via `PORT` environment variable)

## Turbo Pipeline Configuration

See `turbo.json` for task dependencies:
- `build` depends on `^build` (builds dependencies first)
- `dev` has no cache
- `lint` and `test` are cached
- Build outputs: `dist/**`, `.next/**`
