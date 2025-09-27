import path from 'path';
import { promises as fs } from 'fs';
import { RawPosition } from '@portfolio/types';
import { getDbClient } from '../database/config';
import {
  createPositionSet,
  getActivePositionSet,
  PositionSet,
} from '../database/operations/positionSetOperations';

import { getDataPath } from '@portfolio/utils';

const POSITIONS_FILE_PATH = getDataPath('positions.json');

export interface PositionsFileStatus {
  hasFile: boolean;
  positionCount: number;
  message: string;
}

export interface PositionsImportResult {
  count: number;
  positions: RawPosition[];
}

const normalizeBrokerKey = (brokerName: string): string =>
  brokerName.toLowerCase().replace(/[^a-z0-9]+/g, '_');

const normalizeDate = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }
  const normalized = value.includes('-') ? value : value.replace(/\//g, '-');
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString().split('T')[0];
};

const ensureActivePositionSet = async (): Promise<PositionSet> => {
  const active = await getActivePositionSet();
  if (active) {
    return active;
  }

  const fallbackName = 'user-portfolio';
  const newSetId = await createPositionSet({
    name: fallbackName,
    display_name: 'User Portfolio',
    description: 'Automatically created portfolio set',
    info_type: 'info',
    is_active: true,
  });

  const refreshed = await getActivePositionSet();
  if (refreshed) {
    return refreshed;
  }

  throw new Error('Failed to create or retrieve an active position set');
};

const ensureBroker = async (
  brokerName: string | undefined,
  preferredCurrency: string | undefined
): Promise<{ id: number; currency: string }> => {
  const db = getDbClient();
  const displayName = brokerName?.trim() || 'Unknown Broker';
  const defaultCurrency = preferredCurrency || 'USD';

  const existing = await db.execute({
    sql: 'SELECT id, default_currency FROM brokers WHERE display_name = ? LIMIT 1',
    args: [displayName],
  });

  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    return {
      id: Number(row.id),
      currency: String(row.default_currency || defaultCurrency),
    };
  }

  const internalName = normalizeBrokerKey(displayName) || 'unknown_broker';
  const insert = await db.execute({
    sql: `INSERT INTO brokers (name, display_name, default_currency)
          VALUES (?, ?, ?)` ,
    args: [internalName, displayName, defaultCurrency],
  });

  return {
    id: Number(insert.lastInsertRowid),
    currency: defaultCurrency,
  };
};

const ensureAccount = async (
  accountName: string | undefined,
  brokerId: number,
  baseCurrency: string
): Promise<number> => {
  const db = getDbClient();
  const normalizedName = accountName?.trim() || 'General';

  const existing = await db.execute({
    sql: 'SELECT id FROM accounts WHERE name = ? AND broker_id = ? LIMIT 1',
    args: [normalizedName, brokerId],
  });

  if (existing.rows.length > 0) {
    return Number(existing.rows[0].id);
  }

  const insert = await db.execute({
    sql: `INSERT INTO accounts (name, broker_id, account_type, base_currency)
          VALUES (?, ?, ?, ?)` ,
    args: [normalizedName, brokerId, 'BROKERAGE', baseCurrency],
  });

  return Number(insert.lastInsertRowid);
};

const ensureSecurity = async (position: RawPosition): Promise<number> => {
  const db = getDbClient();
  const ticker = position.ticker.toString();

  const existing = await db.execute({
    sql: 'SELECT id FROM securities WHERE ticker = ? LIMIT 1',
    args: [ticker],
  });

  if (existing.rows.length > 0) {
    return Number(existing.rows[0].id);
  }

  const insert = await db.execute({
    sql: `INSERT INTO securities (ticker, name, currency)
          VALUES (?, ?, ?)` ,
    args: [
      ticker,
      position.fullName || ticker,
      position.stockCcy || position.transactionCcy || 'USD',
    ],
  });

  return Number(insert.lastInsertRowid);
};

const insertPositionRecord = async (
  positionSetId: number,
  accountId: number,
  securityId: number,
  position: RawPosition
): Promise<void> => {
  const db = getDbClient();
  const quantity = Number(position.quantity);
  const averageCost = Number(position.costPerUnit);

  if (!Number.isFinite(quantity) || !Number.isFinite(averageCost)) {
    throw new Error(`Invalid numeric values for position ${position.ticker}`);
  }

  const costBasis = quantity * averageCost;
  const transactionDate = normalizeDate(position.transactionDate);

  await db.execute({
    sql: `INSERT INTO positions
          (position_set_id, account_id, security_id, quantity, average_cost, cost_basis, position_currency, transaction_date)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)` ,
    args: [
      positionSetId,
      accountId,
      securityId,
      quantity,
      averageCost,
      costBasis,
      position.transactionCcy || 'USD',
      transactionDate,
    ],
  });
};

const normalizePositionsInput = (data: unknown): RawPosition[] => {
  if (Array.isArray(data)) {
    return data as RawPosition[];
  }
  if (data && typeof data === 'object' && Array.isArray((data as { positions?: unknown }).positions)) {
    return (data as { positions: RawPosition[] }).positions;
  }
  throw new Error('Invalid positions payload. Expected array or { positions: RawPosition[] }');
};

export const readPositionsFromFile = async (
  filePath: string = POSITIONS_FILE_PATH
): Promise<RawPosition[]> => {
  const contents = await fs.readFile(filePath, 'utf-8');
  const json = JSON.parse(contents);
  return normalizePositionsInput(json);
};

export interface UpsertPositionsOptions {
  replaceExisting?: boolean;
}

export const upsertPositionsForSet = async (
  positionSetId: number,
  positions: RawPosition[],
  options: UpsertPositionsOptions = {}
): Promise<number> => {
  if (!Array.isArray(positions) || positions.length === 0) {
    throw new Error('Positions array must contain at least one entry');
  }

  const db = getDbClient();
  await db.execute('BEGIN');
  try {
    if (options.replaceExisting !== false) {
      await db.execute({
        sql: 'DELETE FROM positions WHERE position_set_id = ?',
        args: [positionSetId],
      });
    }

    for (const position of positions) {
      const broker = await ensureBroker(position.broker, position.transactionCcy);
      const accountId = await ensureAccount(position.account, broker.id, broker.currency);
      const securityId = await ensureSecurity(position);
      await insertPositionRecord(positionSetId, accountId, securityId, position);
    }

    await db.execute('COMMIT');
    return positions.length;
  } catch (error) {
    await db.execute('ROLLBACK');
    throw error;
  }
};

export const replaceActivePositionSetPositions = async (
  positions: RawPosition[]
): Promise<number> => {
  const positionSet = await ensureActivePositionSet();
  return upsertPositionsForSet(positionSet.id, positions, { replaceExisting: true });
};

export const importPositionsFromFile = async (
  filePath: string = POSITIONS_FILE_PATH
): Promise<PositionsImportResult> => {
  const positions = await readPositionsFromFile(filePath);
  const count = await replaceActivePositionSetPositions(positions);
  return { count, positions };
};

export const getPositionsFileStatus = async (
  filePath: string = POSITIONS_FILE_PATH
): Promise<PositionsFileStatus> => {
  try {
    const positions = await readPositionsFromFile(filePath);
    return {
      hasFile: true,
      positionCount: positions.length,
      message: `Found positions file with ${positions.length} positions ready to import`,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        hasFile: false,
        positionCount: 0,
        message: 'No positions.json file found. Place your positions.json file in the data/ directory to import.',
      };
    }
    throw error;
  }
};

export const writePositionsFile = async (
  positions: RawPosition[],
  filePath: string = POSITIONS_FILE_PATH
): Promise<void> => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const payload = JSON.stringify({ positions }, null, 2);
  await fs.writeFile(filePath, payload, 'utf-8');
};
