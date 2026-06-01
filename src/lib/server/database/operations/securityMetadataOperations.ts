/**
 * Database operations for per-security metadata (asset class).
 *
 * The asset class is sourced once from Yahoo (`meta.instrumentType`) and then
 * cached as a column on the `securities` table. These helpers are self-
 * contained: they lazily ensure the table and column exist so they work even
 * on a fresh database, independent of the (now no-op) startup path.
 */

import { getDbClient } from '../config';

let schemaReady = false;

/**
 * Ensure the `securities` table and its `asset_class` column exist. Idempotent
 * and cheap after the first call. The CREATE mirrors the canonical schema but
 * drops the currency FK so it stands alone on a bare database.
 */
export const ensureSecuritiesSchema = async (): Promise<void> => {
  if (schemaReady) return;
  const client = getDbClient();

  await client.execute(`
    CREATE TABLE IF NOT EXISTS securities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      security_type TEXT NOT NULL DEFAULT 'stock',
      asset_class TEXT,
      currency TEXT NOT NULL DEFAULT 'USD',
      exchange TEXT,
      sector TEXT,
      industry TEXT,
      country TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

  // Existing databases predate the column — add it if missing.
  const info = await client.execute('PRAGMA table_info(securities)');
  const hasColumn = info.rows.some(row => String(row.name) === 'asset_class');
  if (!hasColumn) {
    await client.execute('ALTER TABLE securities ADD COLUMN asset_class TEXT');
  }

  schemaReady = true;
};

/**
 * Read cached asset classes for the given tickers. Tickers with no row, or a
 * row whose asset_class is still NULL, are simply absent from the result.
 */
export const getStoredAssetClasses = async (
  tickers: string[],
): Promise<Record<string, string>> => {
  const out: Record<string, string> = {};
  if (tickers.length === 0) return out;

  await ensureSecuritiesSchema();
  const client = getDbClient();

  const placeholders = tickers.map(() => '?').join(',');
  const result = await client.execute({
    sql: `SELECT ticker, asset_class FROM securities
          WHERE ticker IN (${placeholders}) AND asset_class IS NOT NULL`,
    args: tickers,
  });

  for (const row of result.rows) {
    out[String(row.ticker)] = String(row.asset_class);
  }
  return out;
};

/**
 * Persist a security's asset class, creating the security row if needed.
 */
export const setSecurityAssetClass = async (
  ticker: string,
  assetClass: string,
): Promise<void> => {
  await ensureSecuritiesSchema();
  const client = getDbClient();

  const existing = await client.execute({
    sql: 'SELECT id FROM securities WHERE ticker = ?',
    args: [ticker],
  });

  if (existing.rows.length === 0) {
    await client.execute({
      sql: 'INSERT INTO securities (ticker, name, asset_class) VALUES (?, ?, ?)',
      args: [ticker, ticker, assetClass],
    });
  } else {
    await client.execute({
      sql: 'UPDATE securities SET asset_class = ?, updated_at = CURRENT_TIMESTAMP WHERE ticker = ?',
      args: [assetClass, ticker],
    });
  }
};
