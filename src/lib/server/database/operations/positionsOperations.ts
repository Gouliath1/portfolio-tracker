import { RawPosition } from '@portfolio/types';
import { getDbClient } from '../config';
import { getActivePositionSet } from './positionSetOperations';

interface PositionRow {
  quantity: number;
  costPerUnit: number;
  transactionCcy: string;
  transactionDate: string | null;
  ticker: string;
  fullName: string;
  stockCcy: string | null;
  account: string;
  broker: string;
}

const mapRowToRawPosition = (row: PositionRow): RawPosition => ({
  transactionDate: row.transactionDate
    ? String(row.transactionDate)
    : '1970-01-01',
  ticker: String(row.ticker),
  fullName: String(row.fullName),
  broker: String(row.broker),
  account: String(row.account),
  quantity: Number(row.quantity),
  costPerUnit: Number(row.costPerUnit),
  transactionCcy: String(row.transactionCcy),
  stockCcy: String(row.stockCcy || row.transactionCcy),
});

export const getPositionsForSet = async (
  positionSetId: number
): Promise<RawPosition[]> => {
  const client = getDbClient();

  const result = await client.execute({
    sql: `
      SELECT 
        p.quantity,
        p.average_cost as costPerUnit,
        p.position_currency as transactionCcy,
        p.transaction_date as transactionDate,
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
      ORDER BY s.ticker
    `,
    args: [positionSetId],
  });

  return (result.rows as unknown as PositionRow[]).map(mapRowToRawPosition);
};

export const getPositionsForActiveSet = async (): Promise<RawPosition[]> => {
  const activeSet = await getActivePositionSet();
  if (!activeSet) {
    return [];
  }
  return getPositionsForSet(activeSet.id);
};
