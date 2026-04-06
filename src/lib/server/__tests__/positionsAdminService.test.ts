/**
 * @jest-environment node
 */

import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import { tmpdir } from 'os';

import {
  closeDbConnection,
  getActivePositions,
  setupDatabase,
} from '@portfolio/server';
import {
  importPositionsFromFile,
  readPositionsFromFile,
  replaceActivePositionSetPositions,
  writePositionsFile,
} from '@portfolio/server';
import { RawPosition } from '@portfolio/types';

const samplePositions: RawPosition[] = [
  {
    transactionDate: '2024/01/01',
    ticker: 'AAPL',
    fullName: 'Apple Inc.',
    broker: 'Interactive Brokers',
    account: 'Margin',
    quantity: 5,
    costPerUnit: 150,
    transactionCcy: 'USD',
    stockCcy: 'USD',
  },
  {
    transactionDate: '2024/02/01',
    ticker: '7203.T',
    fullName: 'Toyota Motor Corp',
    broker: 'Rakuten Securities',
    account: 'Cash',
    quantity: 10,
    costPerUnit: 2000,
    transactionCcy: 'JPY',
    stockCcy: 'JPY',
  },
];

const createTempDatabasePath = (): string => {
  const dir = mkdtempSync(path.join(tmpdir(), 'portfolio-db-'));
  return path.join(dir, 'test.db');
};

const createTempPositionsPath = (): string => {
  const dir = mkdtempSync(path.join(tmpdir(), 'positions-'));
  return path.join(dir, 'positions.json');
};

describe('positionsAdminService', () => {
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

  it('writes and reads positions files correctly', async () => {
    const tempPath = createTempPositionsPath();

    await writePositionsFile(samplePositions, tempPath);

    const readBack = await readPositionsFromFile(tempPath);
    expect(readBack).toHaveLength(2);
    expect(readBack[0].ticker).toBe('AAPL');

    const payload = { positions: samplePositions };
    writeFileSync(tempPath, JSON.stringify(payload));

    const readAlternate = await readPositionsFromFile(tempPath);
    expect(readAlternate).toHaveLength(2);

    rmSync(path.dirname(tempPath), { recursive: true, force: true });
  });

  it('replaces positions in the active set', async () => {
    const count = await replaceActivePositionSetPositions(samplePositions);
    expect(count).toBe(samplePositions.length);

    const storedPositions = await getActivePositions();
    expect(storedPositions).toHaveLength(samplePositions.length);
  });

  it('imports positions from file into active set', async () => {
    const tempPath = createTempPositionsPath();
    writeFileSync(tempPath, JSON.stringify(samplePositions));

    const result = await importPositionsFromFile(tempPath);
    expect(result.count).toBe(samplePositions.length);

    const storedPositions = await getActivePositions();
    expect(storedPositions).toHaveLength(samplePositions.length);

    rmSync(path.dirname(tempPath), { recursive: true, force: true });
  });
});
