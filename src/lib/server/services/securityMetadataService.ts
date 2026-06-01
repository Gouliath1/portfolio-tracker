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

  const cached = await getStoredAssetClasses(unique);
  const result: Record<string, string> = { ...cached };

  const missing = unique.filter(t => !result[t]);
  for (const ticker of missing) {
    const instrumentType = await fetchInstrumentType(ticker);
    const assetClass = assetClassFromInstrumentType(instrumentType);
    await setSecurityAssetClass(ticker, assetClass);
    result[ticker] = assetClass;
  }

  return result;
};
