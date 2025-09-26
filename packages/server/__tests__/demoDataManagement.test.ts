/**
 * @jest-environment node
 */

import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

import {
  closeDbConnection,
  getDbClient,
  initializeDemoPositions,
  setupDatabase,
} from '@portfolio/server';

const createTempDatabasePath = (): string => {
  const dir = mkdtempSync(path.join(tmpdir(), 'portfolio-db-'));
  return path.join(dir, 'test.db');
};

describe('initializeDemoPositions', () => {
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

  it('seeds brokers, accounts, and positions for demo portfolio', async () => {
    await initializeDemoPositions();
    const client = getDbClient();

    const brokerResult = await client.execute({
      sql: `SELECT name, display_name FROM brokers WHERE name IN (?, ?, ?, ?)`,
      args: ['credit_agricole', 'rakuten', 'interactive_brokers', 'fidelity']
    });

    expect(brokerResult.rows).toHaveLength(4);

    const accountResult = await client.execute(
      `SELECT a.name as account_name, b.name as broker_name
       FROM accounts a
       JOIN brokers b ON a.broker_id = b.id`
    );

    const accountMap = new Map<string, Set<string>>();
    for (const row of accountResult.rows) {
      const brokerName = String(row.broker_name);
      const accountName = String(row.account_name);
      if (!accountMap.has(brokerName)) {
        accountMap.set(brokerName, new Set());
      }
      accountMap.get(brokerName)?.add(accountName);
    }

    expect(accountMap.get('interactive_brokers')).toEqual(new Set(['US Margin']));
    expect(accountMap.get('fidelity')).toEqual(new Set(['Retirement IRA']));
    expect(accountMap.get('rakuten')).toEqual(new Set(['Japan Cash', 'NISA - Growth']));
    expect(accountMap.get('credit_agricole')).toEqual(new Set(['PEA']));

    const positionCount = await client.execute(`SELECT COUNT(*) as count FROM positions`);
    expect(Number(positionCount.rows[0].count)).toBeGreaterThan(0);

    const positionSetQuery = await client.execute(
      `SELECT name, is_active FROM position_sets WHERE name = 'demo'`
    );
    expect(positionSetQuery.rows).toHaveLength(1);
    expect(Boolean(positionSetQuery.rows[0].is_active)).toBe(true);
  });
});
