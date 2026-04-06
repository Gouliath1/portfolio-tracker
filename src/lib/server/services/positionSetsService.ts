import { RawPosition } from '@portfolio/types';
import { getDbClient } from '../database/config';
import {
  createPositionSet,
  deletePositionSet,
  getActivePositionSet,
  getAllPositionSets,
  PositionSet,
  setActivePositionSet,
} from '../database/operations/positionSetOperations';
import { upsertPositionsForSet } from './positionsAdminService';

export interface PositionSetsOverview {
  positionSets: PositionSet[];
  activeSet: PositionSet | null;
}

export interface PositionSetExport {
  positionSet: {
    name: string;
    display_name: string;
    description: string | null;
    created_at: string;
  };
  positions: RawPosition[];
}

export interface ImportPositionSetPayload {
  name: string;
  description?: string;
  positions: RawPosition[];
  setAsActive?: boolean;
}

export interface ImportPositionSetResult {
  positionSetId: number;
  positionsImported: number;
}

const formatDateForExport = (value: string | null): string => {
  if (!value) {
    return new Date().toLocaleDateString('en-CA').replace(/-/g, '/');
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString('en-CA').replace(/-/g, '/');
};

export const getPositionSetsOverview = async (): Promise<PositionSetsOverview> => {
  const [positionSets, activeSet] = await Promise.all([
    getAllPositionSets(),
    getActivePositionSet(),
  ]);

  return {
    positionSets,
    activeSet,
  };
};

export const activatePositionSetById = async (positionSetId: number): Promise<void> => {
  await setActivePositionSet(positionSetId);
};

export const deletePositionSetById = async (positionSetId: number): Promise<void> => {
  await deletePositionSet(positionSetId);
};

export const exportPositionSetById = async (
  positionSetId: number
): Promise<PositionSetExport> => {
  const client = getDbClient();

  const setResult = await client.execute({
    sql: 'SELECT * FROM position_sets WHERE id = ? LIMIT 1',
    args: [positionSetId],
  });

  if (setResult.rows.length === 0) {
    throw new Error('Position set not found');
  }

  const setRow = setResult.rows[0];

  const positionsResult = await client.execute({
    sql: `
      SELECT 
        p.quantity,
        p.average_cost,
        p.position_currency as transactionCcy,
        p.transaction_date,
        p.created_at,
        s.ticker,
        s.name as fullName,
        s.currency as stockCcy,
        a.name as account,
        b.display_name as broker
      FROM positions p
      JOIN securities s ON p.security_id = s.id
      JOIN accounts a ON p.account_id = a.id
      JOIN brokers b ON a.broker_id = b.id
      WHERE p.position_set_id = ?
      ORDER BY p.created_at ASC
    `,
    args: [positionSetId],
  });

  const positions: RawPosition[] = positionsResult.rows.map(row => ({
    transactionDate: formatDateForExport(
      (row.transaction_date as string | null) ?? (row.created_at as string | null)
    ),
    ticker: String(row.ticker),
    fullName: String(row.fullName ?? row.ticker),
    broker: row.broker ? String(row.broker) : undefined,
    account: String(row.account ?? 'General'),
    quantity: Number(row.quantity ?? 0),
    costPerUnit: Number(row.average_cost ?? 0),
    transactionCcy: String(row.transactionCcy ?? 'USD'),
    stockCcy: String(row.stockCcy ?? row.transactionCcy ?? 'USD'),
  }));

  return {
    positionSet: {
      name: String(setRow.name),
      display_name: String(setRow.display_name),
      description: setRow.description ? String(setRow.description) : null,
      created_at: String(setRow.created_at),
    },
    positions,
  };
};

export const importPositionSetData = async (
  payload: ImportPositionSetPayload
): Promise<ImportPositionSetResult> => {
  const { name, description, positions, setAsActive } = payload;

  if (!name || !Array.isArray(positions) || positions.length === 0) {
    throw new Error('Import payload requires a name and at least one position');
  }

  const positionSetId = await createPositionSet({
    name,
    display_name: name,
    description,
    info_type: 'info',
    is_active: Boolean(setAsActive),
  });

  const importedCount = await upsertPositionsForSet(positionSetId, positions, {
    replaceExisting: true,
  });

  if (setAsActive) {
    await setActivePositionSet(positionSetId);
  }

  return {
    positionSetId,
    positionsImported: importedCount,
  };
};

