/**
 * @jest-environment node
 */

import { mkdtempSync, rmSync } from 'fs';
import path from 'path';
import { tmpdir } from 'os';

import {
  activatePositionSetById,
  closeDbConnection,
  deletePositionSetById,
  exportPositionSetById,
  getPositionSetsOverview,
  importPositionSetData,
  setupDatabase,
} from '@portfolio/server';
import { RawPosition } from '@portfolio/types';

const samplePositions: RawPosition[] = [
  {
    transactionDate: '2023/12/15',
    ticker: 'VOO',
    fullName: 'Vanguard S&P 500 ETF',
    broker: 'Fidelity',
    account: 'IRA',
    quantity: 3,
    costPerUnit: 360,
    transactionCcy: 'USD',
    stockCcy: 'USD',
  },
];

const anotherPositions: RawPosition[] = [
  {
    transactionDate: '2024/01/10',
    ticker: 'MC.PA',
    fullName: 'LVMH',
    broker: 'Credit Agricole',
    account: 'PEA',
    quantity: 2,
    costPerUnit: 800,
    transactionCcy: 'EUR',
    stockCcy: 'EUR',
  },
];

const createTempDatabasePath = (): string => {
  const dir = mkdtempSync(path.join(tmpdir(), 'portfolio-db-'));
  return path.join(dir, 'test.db');
};

describe('positionSetsService', () => {
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

  it('imports, activates, exports, and deletes position sets', async () => {
    const overviewBefore = await getPositionSetsOverview();
    expect(overviewBefore.positionSets).toHaveLength(0);

    const firstImport = await importPositionSetData({
      name: 'test-set',
      description: 'Primary set',
      positions: samplePositions,
      setAsActive: true,
    });

    let overview = await getPositionSetsOverview();
    expect(overview.positionSets).toHaveLength(1);
    expect(overview.activeSet?.id).toBe(firstImport.positionSetId);

    const exported = await exportPositionSetById(firstImport.positionSetId);
    expect(exported.positions).toHaveLength(1);
    expect(exported.positionSet.name).toBe('test-set');

    const secondImport = await importPositionSetData({
      name: 'backup-set',
      positions: anotherPositions,
      setAsActive: false,
    });

    await activatePositionSetById(secondImport.positionSetId);
    overview = await getPositionSetsOverview();
    expect(overview.activeSet?.id).toBe(secondImport.positionSetId);

    await deletePositionSetById(firstImport.positionSetId);
    overview = await getPositionSetsOverview();
    expect(overview.positionSets).toHaveLength(1);
    expect(overview.positionSets[0].id).toBe(secondImport.positionSetId);
  });
});
