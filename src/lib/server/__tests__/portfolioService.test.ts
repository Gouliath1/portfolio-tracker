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
    calculatePortfolioSummary: jest.fn(),
  };
});

import {
  closeDbConnection,
  getActivePortfolioSnapshot,
  getActivePositions,
  initializeDemoDatabase,
  setupDatabase,
} from '@portfolio/server';
import { calculatePortfolioSummary } from '@portfolio/core';
import { PortfolioSummary } from '@portfolio/types';

const mockedCalculatePortfolioSummary = calculatePortfolioSummary as jest.MockedFunction<typeof calculatePortfolioSummary>;

const createTempDatabasePath = (): string => {
  const dir = mkdtempSync(path.join(tmpdir(), 'portfolio-db-'));
  return path.join(dir, 'test.db');
};

describe('portfolioService', () => {
  let originalDatabasePath: string | undefined;
  let dbPath: string;

  beforeEach(async () => {
    originalDatabasePath = process.env.DATABASE_PATH;
    dbPath = createTempDatabasePath();
    process.env.DATABASE_PATH = dbPath;
    mockedCalculatePortfolioSummary.mockReset();
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

  it('returns empty snapshot when no positions exist', async () => {
    const snapshot = await getActivePortfolioSnapshot();

    expect(snapshot.rawPositions).toEqual([]);
    expect(snapshot.summary.totalCostJPY).toBe(0);
    expect(snapshot.summary.totalPnlJPY).toBe(0);
    expect(snapshot.summary.totalPnlPercentage).toBe(0);
    expect(mockedCalculatePortfolioSummary).not.toHaveBeenCalled();
  });

  it('returns calculated snapshot when positions are present', async () => {
    await initializeDemoDatabase();

    const fakeSummary: PortfolioSummary = {
      totalValueJPY: 1000,
      totalCostJPY: 900,
      totalPnlJPY: 100,
      totalPnlPercentage: 11.11,
      positions: [
        {
          ticker: 'TEST',
          transactionDate: '2024-01-01',
          quantity: 1,
          costPerUnit: 900,
          transactionCcy: 'USD',
          fullName: 'Test Security',
          stockCcy: 'USD',
          account: 'Demo Account',
          broker: 'Demo Broker',
          currentPrice: 1000,
          costInJPY: 900,
          currentValueJPY: 1000,
          pnlJPY: 100,
          pnlPercentage: 11.11,
          transactionFxRate: 1,
          currentFxRate: 1,
        },
      ],
    };

    mockedCalculatePortfolioSummary.mockResolvedValue(fakeSummary);

    const snapshot = await getActivePortfolioSnapshot({ forceRefresh: true });

    expect(mockedCalculatePortfolioSummary).toHaveBeenCalledTimes(1);
    const [positionsArg, forceRefreshArg] = mockedCalculatePortfolioSummary.mock.calls[0];
    expect(Array.isArray(positionsArg)).toBe(true);
    expect(positionsArg.length).toBeGreaterThan(0);
    expect(forceRefreshArg).toBe(true);

    expect(snapshot.summary).toEqual(fakeSummary);
    expect(snapshot.rawPositions.length).toBeGreaterThan(0);
    expect(snapshot.summary.positions).toHaveLength(1);
    expect(new Date(snapshot.timestamp).toString()).not.toEqual('Invalid Date');
  });

  it('exposes helper to fetch active positions directly', async () => {
    await initializeDemoDatabase();

    const positions = await getActivePositions();

    expect(Array.isArray(positions)).toBe(true);
    expect(positions.length).toBeGreaterThan(0);
    expect(positions[0]).toHaveProperty('ticker');
  });
});
