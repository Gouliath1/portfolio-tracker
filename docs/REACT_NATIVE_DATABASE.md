# React Native Database Implementation Notes

## Current Status (2025-10-21)

The mobile app successfully bundles (722 modules) and runs, but we're hitting database compatibility issues with `@libsql/client` in React Native.

## The Problem

### Why @libsql/client Doesn't Work with Local Files in React Native

`@libsql/client` (Turso's SQLite client) has two separate builds:

1. **Node.js build** (`node.js`)
   - Uses Node's `fs` module to access local files
   - Supports `file:` URLs for local SQLite databases
   - Works great in Next.js (web app)

2. **Web build** (`web.js`)
   - Uses WebAssembly for SQLite
   - Only supports remote/in-memory connections
   - Supported URL schemes: `libsql:`, `wss:`, `ws:`, `https:`, `http:`, `:memory:`
   - **DOES NOT support `file:` URLs**

### Why React Native Uses the Web Build

React Native doesn't have Node.js's `fs` module, so Metro bundler picks the web build. We explicitly configured this in `/apps/mobile/metro.config.js`:

```javascript
// Force @libsql/client to use web build
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@libsql/client') {
    return {
      filePath: path.join(
        workspaceRoot,
        'node_modules/.pnpm/@libsql+client@0.15.15/node_modules/@libsql/client/lib-esm/web.js'
      ),
      type: 'sourceFile',
    };
  }
  // ... rest of resolver
};
```

## SQLite IS Compatible with React Native

**Important**: SQLite absolutely CAN be used in React Native apps! The issue is specifically with `@libsql/client`'s web build, not SQLite itself.

Native SQLite solutions for React Native:
- **expo-sqlite** - Official Expo SQLite library (recommended)
- **op-sqlite** - Faster alternative with better performance
- **react-native-sqlite-storage** - Popular community library

These use native bindings (C/C++ libraries) on iOS/Android to provide true local file-based SQLite databases.

## Current Workaround Attempts

### Attempt 1: In-Memory Database (Temporary)

Modified `/packages/server/src/database/config.ts` to detect React Native environment and use in-memory database:

```typescript
export const getDbClient = (): Client => {
  const isReactNative = typeof process === 'undefined' || !process.versions?.node;

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
      const isReactNative = typeof process === 'undefined' || !process.versions?.node;

      if (isReactNative) {
        // React Native: Use in-memory database
        // Note: This means data won't persist between app restarts
        dbClient = createClient({
          url: ':memory:',
        });
        console.log('Connected to in-memory SQLite database (React Native)');
      } else {
        // Node.js: Connect to local SQLite file
        // ... existing code
      }
    }
  }

  return dbClient;
};
```

**Status**: Still debugging why this doesn't work. The singleton pattern may be causing issues with Hot Module Replacement.

**Limitation**: Data is lost on app restart - not suitable for production.

## Recommended Solutions

### Option 1: Use Turso Cloud (Quick Test Solution) ⭐ CURRENT PLAN

**Pros**:
- Works immediately with current `@libsql/client` setup
- No code changes needed to database operations
- Good for testing app functionality
- Can sync data across devices

**Cons**:
- Requires internet connection
- Requires Turso account and setup
- Not ideal for sensitive financial data

**Implementation**:
1. Sign up for Turso at https://turso.tech
2. Create a new database
3. Get database URL and auth token
4. Set environment variables in `/apps/mobile/.env`:
   ```bash
   TURSO_DATABASE_URL=libsql://your-database.turso.io
   TURSO_AUTH_TOKEN=your-auth-token
   ```
5. App will automatically use Turso cloud database

### Option 2: Migrate to expo-sqlite (Production Solution) 🎯 FUTURE GOAL

**Pros**:
- True local file-based SQLite
- Data persists between app restarts
- Works offline
- Better performance for mobile
- Well-supported by Expo

**Cons**:
- Requires migration work
- Need to create adapter layer
- Different API from @libsql/client

**Implementation Steps** (for future reference):

1. **Install expo-sqlite**:
   ```bash
   cd apps/mobile
   npx expo install expo-sqlite
   ```

2. **Create SQLite adapter** in `/packages/server/src/database/sqlite-adapter.ts`:
   ```typescript
   import * as SQLite from 'expo-sqlite';

   // Implement adapter that matches @libsql/client's interface
   export class SQLiteAdapter {
     private db: SQLite.SQLiteDatabase;

     async execute(sql: string, args?: any[]) {
       // Translate @libsql/client API to expo-sqlite API
     }

     // ... other methods
   }
   ```

3. **Update `/packages/server/src/database/config.ts`**:
   ```typescript
   export const getDbClient = (): Client => {
     const isReactNative = typeof process === 'undefined' || !process.versions?.node;

     if (!dbClient) {
       if (isReactNative) {
         // Use expo-sqlite adapter
         dbClient = new SQLiteAdapter('portfolio.db') as unknown as Client;
       } else {
         // Use @libsql/client for Node.js/web
         dbClient = createClient({
           url: `file:${config.localPath}`,
         });
       }
     }

     return dbClient;
   };
   ```

4. **Test thoroughly**:
   - All database operations work
   - Data persists across app restarts
   - Schema migrations work correctly

### Option 3: Hybrid Approach (Best of Both Worlds)

Use expo-sqlite for local storage but sync with Turso cloud for backup/multi-device access.

**Future consideration** - would require:
- Background sync mechanism
- Conflict resolution strategy
- Offline-first architecture

## Files Modified for React Native Compatibility

### Dynamic Module Loading Pattern

To avoid "Node.js module not found" errors, we use dynamic require pattern:

```typescript
// DON'T DO THIS:
import fs from 'fs';

// DO THIS:
type FsModule = any;
let cachedFs: FsModule | null | undefined;

const loadFs = (): FsModule | null => {
  if (cachedFs !== undefined) {
    return cachedFs;
  }

  if (typeof process === 'undefined' || !process.versions?.node) {
    cachedFs = null; // Not in Node.js environment
    return cachedFs;
  }

  try {
    const req = Function('return require')() as NodeJS.Require;
    cachedFs = req('fs/promises') as FsModule;
    return cachedFs;
  } catch {
    cachedFs = null;
    return cachedFs;
  }
};
```

### Files Updated

1. **`/packages/server/src/database/config.ts`**
   - Added dynamic `fs` and `path` loading
   - Added React Native environment detection
   - Added in-memory database fallback

2. **`/packages/server/src/services/fxRateService.ts`**
   - Added dynamic `fs/promises` loading
   - Made file path lazy: `const getFxRatesFilePath = () => getDataPath('fxRates.json')`

3. **`/packages/server/src/services/positionsAdminService.ts`**
   - Added dynamic `fs/promises` and `path` loading
   - Made file path lazy: `const getPositionsFilePath = () => getDataPath('positions.json')`

4. **`/packages/utils/src/projectPaths.ts`**
   - Added dynamic `path` loading

5. **`/packages/core/src/yahooFinanceApi.ts`**
   - Changed from dynamic import to dynamic require

## Metro Bundler Configuration

### `/apps/mobile/metro.config.js`

```javascript
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.join(projectRoot, 'node_modules'),
  path.join(workspaceRoot, 'node_modules'),
];
config.resolver.assetExts.push('cjs');

// Force @libsql/client to use web build and resolve @libsql/core subpath imports
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Map @libsql/client to web build
  if (moduleName === '@libsql/client') {
    return {
      filePath: path.join(
        workspaceRoot,
        'node_modules/.pnpm/@libsql+client@0.15.15/node_modules/@libsql/client/lib-esm/web.js'
      ),
      type: 'sourceFile',
    };
  }

  // Map @libsql/core subpath imports
  if (moduleName.startsWith('@libsql/core/')) {
    const subpath = moduleName.replace('@libsql/core/', '');
    return {
      filePath: path.join(
        workspaceRoot,
        `node_modules/.pnpm/@libsql+core@0.15.15/node_modules/@libsql/core/lib-esm/${subpath}.js`
      ),
      type: 'sourceFile',
    };
  }

  // Default resolution
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
```

**Why this is needed**:
- Metro doesn't handle package subpath exports well
- @libsql/client has separate builds (node/web)
- @libsql/core uses subpath imports that need explicit resolution

## Testing Progress

### ✅ Working
- App bundles successfully (722 modules)
- Metro resolves @libsql/client and @libsql/core correctly
- Dynamic module loading prevents "Node.js module not found" errors
- Lazy evaluation prevents "getDataPath requires Node.js environment" errors
- React Native environment detection works (logs show `isReactNative: true`)

### ❌ Not Working Yet
- Database initialization with in-memory database
- Possible singleton caching issue with Hot Module Replacement
- Need to debug why file: URL client persists despite environment detection

### 🔄 Next Steps
1. Switch to Turso cloud for immediate testing
2. Continue building out mobile app UI/features
3. Plan expo-sqlite migration for production

## Key Learnings

1. **pnpm workspace isolation**: Uses symlinks, not copies. Metro reads directly from `/packages/server/dist`.

2. **Hot Module Replacement**: May cause singleton pattern issues. Module-level variables persist across reloads in unexpected ways.

3. **Environment detection**: React Native DOES have a `process` object (from Metro polyfills), but `process.versions.node` is undefined.

4. **@libsql/client limitations**: Web build cannot access local files, only remote URLs or in-memory databases.

5. **Metro caching**: Aggressive caching requires frequent cache clearing during development:
   ```bash
   watchman watch-del-all
   rm -rf apps/mobile/node_modules/.cache
   npx expo start --clear
   ```

## References

- [@libsql/client documentation](https://github.com/libsql/libsql-client-ts)
- [Expo SQLite documentation](https://docs.expo.dev/versions/latest/sdk/sqlite/)
- [Metro bundler configuration](https://facebook.github.io/metro/docs/configuration)
- [Turso documentation](https://docs.turso.tech/)

## Migration Plan

### Phase 1: Turso Cloud (Current) ⭐
**Goal**: Get the mobile app working quickly for testing and UI development
**Timeline**: Immediate

1. Set up Turso cloud database
2. Configure environment variables
3. Test all features work with cloud database
4. Continue building mobile UI and features

**Success Criteria**: Mobile app fully functional with all features working

### Phase 2: expo-sqlite Migration (Next) 🎯
**Goal**: Production-ready local database with offline support
**Timeline**: After Phase 1 is complete and tested

1. Install expo-sqlite
2. Create adapter layer
3. Migrate database operations
4. Test data persistence
5. Ensure offline functionality works

**Success Criteria**: App works offline with persistent local data

## Timeline

- **2025-10-21**: Identified database compatibility issue
- **2025-10-21**: Fixed all Node.js module imports
- **2025-10-21**: Fixed lazy evaluation issues
- **2025-10-21**: Documented approach for future migration
- **2025-10-21**: **DECISION**: Phase 1 (Turso) → Phase 2 (expo-sqlite)
- **Next**: Switch to Turso cloud, continue UI development
- **Future**: Migrate to expo-sqlite for production
