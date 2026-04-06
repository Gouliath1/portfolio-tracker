/**
 * @jest-environment node
 */

import { mkdtempSync, rmSync } from 'fs';
import path from 'path';
import { tmpdir } from 'os';

import {
  closeDbConnection,
  getPositionsForActiveSet,
  initializeDemoPositions,
  setupDatabase,
} from '@portfolio/server';

const createTempDatabasePath = (): string => {
  const dir = mkdtempSync(path.join(tmpdir(), 'portfolio-db-'));
  return path.join(dir, 'test.db');
};

describe('positionsOperations', () => {
  let originalDatabasePath: string | undefined;
  let dbPath: string;

  beforeEach(async () => {
    originalDatabasePath = process.env.DATABASE_PATH;
    dbPath = createTempDatabasePath();
    process.env.DATABASE_PATH = dbPath;
    await closeDbConnection();
    await setupDatabase();
    await initializeDemoPositions();
  });

  afterEach(async () => {
    await closeDbConnection();
    if (originalDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = originalDatabasePath;
    }
    const dbDir = path.dirname(dbPath);
    rmSync(dbDir, { recursive: true, force: true });
  });

  it('returns positions for the active set', async () => {
    const positions = await getPositionsForActiveSet();
    expect(positions.length).toBeGreaterThan(0);

    const uniqueBrokers = new Set(positions.map((p) => p.broker));
    expect(uniqueBrokers.has('Rakuten Securities')).toBe(true);
    expect(uniqueBrokers.has('Interactive Brokers')).toBe(true);
  });
});
