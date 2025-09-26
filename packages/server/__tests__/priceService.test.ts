/**
 * @jest-environment node
 */

import { mkdtempSync, rmSync } from 'fs';
import path from 'path';
import { tmpdir } from 'os';

jest.mock('@portfolio/core', () => {
  const actual = jest.requireActual('@portfolio/core');
  return {
    ...actual,
    fetchStockPrice: jest.fn(),
  };
});

import {
  closeDbConnection,
  setupDatabase,
  storePriceData,
} from '@portfolio/server';
import {
  getLatestPriceForSymbol,
  storePriceForSymbol,
} from '@portfolio/server';
import { fetchStockPrice } from '@portfolio/core';

const mockedFetchStockPrice = fetchStockPrice as jest.MockedFunction<typeof fetchStockPrice>;

const createTempDatabasePath = (): string => {
  const dir = mkdtempSync(path.join(tmpdir(), 'portfolio-db-'));
  return path.join(dir, 'test.db');
};

describe('priceService', () => {
  let originalDatabasePath: string | undefined;
  let dbPath: string;

  beforeEach(async () => {
    originalDatabasePath = process.env.DATABASE_PATH;
    dbPath = createTempDatabasePath();
    process.env.DATABASE_PATH = dbPath;
    mockedFetchStockPrice.mockReset();
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

  it('returns cached price when available in database', async () => {
    const today = new Date().toISOString().split('T')[0];
    await storePriceData('AAPL', today, 150.25);

    const result = await getLatestPriceForSymbol('AAPL');

    expect(result.price).toBe(150.25);
    expect(result.source).toBe('database');
    expect(mockedFetchStockPrice).not.toHaveBeenCalled();
  });

  it('fetches and stores fresh price when cache is missing', async () => {
    mockedFetchStockPrice.mockResolvedValue(201.75);

    const result = await getLatestPriceForSymbol('MSFT');

    expect(result.price).toBe(201.75);
    expect(result.source).toBe('fresh');
    expect(mockedFetchStockPrice).toHaveBeenCalledWith('MSFT', true);

    mockedFetchStockPrice.mockClear();
    const cached = await getLatestPriceForSymbol('MSFT');
    expect(cached.price).toBe(201.75);
    expect(cached.source).toBe('database');
    expect(mockedFetchStockPrice).not.toHaveBeenCalled();
  });

  it('persists prices using storePriceForSymbol', async () => {
    const today = new Date().toISOString().split('T')[0];
    await storePriceForSymbol('TSLA', 250.5, today);

    const result = await getLatestPriceForSymbol('TSLA');
    expect(result.price).toBe(250.5);
    expect(result.date).toBe(today);
  });
});
