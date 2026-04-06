/**
 * @jest-environment node
 */

import { mkdtempSync, rmSync } from 'fs';
import path from 'path';
import { tmpdir } from 'os';

import {
  closeDbConnection,
  setupDatabase,
  storeFxRate,
} from '@portfolio/server';
import {
  getFxRateWithFallback,
  updateFxRate,
} from '@portfolio/server';

const createTempDatabasePath = (): string => {
  const dir = mkdtempSync(path.join(tmpdir(), 'portfolio-db-'));
  return path.join(dir, 'test.db');
};

describe('fxRateService', () => {
  let originalDatabasePath: string | undefined;
  let dbPath: string;

  beforeEach(async () => {
    originalDatabasePath = process.env.DATABASE_PATH;
    dbPath = createTempDatabasePath();
    process.env.DATABASE_PATH = dbPath;
    await closeDbConnection();
    await setupDatabase();
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

  it('retrieves FX rate stored in the database', async () => {
    await storeFxRate('USDJPY', 110.5, '2024-01-01');

    const result = await getFxRateWithFallback('USDJPY', { date: '2024-01-01' });

    expect(result.rate).toBe(110.5);
    expect(result.date).toBe('2024-01-01');
    expect(result.source).toBe('database');
  });

  it('updates FX rate via service helper', async () => {
    await updateFxRate('eurusd', 1.095, '2024-02-10');

    const result = await getFxRateWithFallback('EURUSD', { date: '2024-02-10' });

    expect(result.rate).toBeCloseTo(1.095);
    expect(result.source).toBe('database');
  });
});
