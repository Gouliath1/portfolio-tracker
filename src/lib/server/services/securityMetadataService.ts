/**
 * Resolves asset classes for a set of tickers, using the DB cache first and
 * falling back to Yahoo for any that haven't been classified yet. Newly
 * fetched classes are written back to the DB so each ticker is fetched once.
 */

import { fetchInstrumentType, assetClassFromInstrumentType } from '@portfolio/core';
import {
  getStoredAssetClasses,
  setSecurityAssetClass,
} from '../database/operations/securityMetadataOperations';

export const resolveAssetClasses = async (
  tickers: string[],
): Promise<Record<string, string>> => {
  const unique = [...new Set(tickers.map(t => String(t).trim()).filter(Boolean))];
  if (unique.length === 0) return {};

  // DB read is best-effort: a cache miss (or an unavailable DB in prod) must
  // not blank out the whole response — we can always re-derive from Yahoo.
  let cached: Record<string, string> = {};
  try {
    cached = await getStoredAssetClasses(unique);
  } catch (err) {
    console.warn('[asset-class] cache read failed; resolving from Yahoo without cache:', err);
  }
  const result: Record<string, string> = { ...cached };

  const missing = unique.filter(t => !result[t]);
  for (const ticker of missing) {
    const instrumentType = await fetchInstrumentType(ticker);
    const assetClass = assetClassFromInstrumentType(instrumentType);
    result[ticker] = assetClass;
    // DB write is best-effort too: persist for next time where the DB works,
    // but a write failure must not abort — we still return the resolved class.
    try {
      await setSecurityAssetClass(ticker, assetClass);
    } catch (err) {
      console.warn(`[asset-class] cache write failed for ${ticker}; returning uncached value:`, err);
    }
  }

  return result;
};
