/**
 * @jest-environment node
 */

import { mkdtempSync, rmSync } from 'fs';
import path from 'path';
import { tmpdir } from 'os';

jest.mock('../src/services/portfolioService', () => ({
  getActivePositions: jest.fn(),
}));

jest.mock('@portfolio/core', () => {
  const actual = jest.requireActual('@portfolio/core');
  return {
    ...actual,
    refreshAllHistoricalData: jest.fn(),
    refreshFxRatesForDates: jest.fn(),
  };
});

import {
  closeDbConnection,
  setupDatabase,
  storeFxRate,
  storePriceData,
} from '@portfolio/server';
import {
  getHistoricalDataSummary,
  NoPositionsAvailableError,
  refreshHistoricalDataForActivePortfolio,
} from '@portfolio/server';
import { getActivePositions } from '../src/services/portfolioService';
import { refreshAllHistoricalData, refreshFxRatesForDates } from '@portfolio/core';

const mockedGetActivePositions = getActivePositions as jest.MockedFunction<typeof getActivePositions>;
const mockedRefreshAllHistoricalData = refreshAllHistoricalData as jest.MockedFunction<typeof refreshAllHistoricalData>;
const mockedRefreshFxRatesForDates = refreshFxRatesForDates as jest.MockedFunction<typeof refreshFxRatesForDates>;

const createTempDatabasePath = (): string => {
  const dir = mkdtempSync(path.join(tmpdir(), 'portfolio-db-'));
  return path.join(dir, 'test.db');
};

describe('historicalDataService', () => {
  let originalDatabasePath: string | undefined;
  let dbPath: string;

  beforeEach(async () => {
    originalDatabasePath = process.env.DATABASE_PATH;
    dbPath = createTempDatabasePath();
    process.env.DATABASE_PATH = dbPath;
    mockedGetActivePositions.mockReset();
    mockedRefreshAllHistoricalData.mockReset();
    mockedRefreshFxRatesForDates.mockReset();
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

  it('refreshes historical data for active portfolio', async () => {
    mockedGetActivePositions.mockResolvedValue([
      {
        ticker: 'AAPL',
        transactionDate: '2024-01-01',
        transactionCcy: 'USD',
        quantity: 1,
        costPerUnit: 100,
        account: 'Test',
        broker: 'Broker',
        fullName: 'Apple',
        stockCcy: 'USD',
      },
    ] as any);

    mockedRefreshAllHistoricalData.mockResolvedValue({
      AAPL: { '2024-01-01': 140 },
    });
    mockedRefreshFxRatesForDates.mockResolvedValue({
      USDJPY: { '2024-01-01': 110 },
    });

    const result = await refreshHistoricalDataForActivePortfolio();

    expect(result.positionsProcessed).toBe(1);
    expect(result.historicalResults.AAPL).toEqual({ '2024-01-01': 140 });
    expect(result.fxResults.USDJPY).toEqual({ '2024-01-01': 110 });
  });

  it('throws when no positions are available', async () => {
    mockedGetActivePositions.mockResolvedValue([]);

    await expect(refreshHistoricalDataForActivePortfolio()).rejects.toBeInstanceOf(NoPositionsAvailableError);
  });

  it('summarises historical data counts', async () => {
    await storePriceData('AAPL', '2024-01-01', 150);
    await storeFxRate('USDJPY', 110, '2024-01-01');

    const summary = await getHistoricalDataSummary();

    expect(summary.historicalPrices).toBeGreaterThanOrEqual(1);
    expect(summary.fxRates).toBeGreaterThanOrEqual(1);
    expect(summary.securitiesWithData).toBeGreaterThanOrEqual(1);
    expect(summary.lastDataDate).toBe('2024-01-01');
    expect(summary.daysSinceLastData).toBeGreaterThanOrEqual(0);
  });
});
