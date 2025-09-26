import path from 'path';
import { promises as fs } from 'fs';
import { getFxRate, migrateFxRatesFromJson, storeFxRate } from '../database/operations/fxRateOperations';

const FX_RATES_FILE_PATH = path.join(process.cwd(), 'data', 'fxRates.json');

export interface FxRateQueryOptions {
  date?: string;
}

export type FxRateSource = 'database' | 'file' | 'none';

export interface FxRateResult {
  pair: string;
  rate: number | null;
  date: string | null;
  requestedDate?: string;
  source: FxRateSource;
}

const readFxRatesFile = async (): Promise<Record<string, Record<string, number>> | null> => {
  try {
    const data = await fs.readFile(FX_RATES_FILE_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
};

export const getFxRateWithFallback = async (
  pair: string,
  options: FxRateQueryOptions = {}
): Promise<FxRateResult> => {
  const trimmedPair = pair.trim().toUpperCase();
  if (trimmedPair.length !== 6) {
    throw new Error('FX pair must be 6 characters (e.g., USDJPY)');
  }

  const initialResult = await getFxRate(trimmedPair, options.date);
  if (initialResult && initialResult.rate !== null) {
    return {
      pair: trimmedPair,
      rate: initialResult.rate,
      date: initialResult.date,
      requestedDate: initialResult.requestedDate,
      source: 'database',
    };
  }

  const fileData = await readFxRatesFile();
  if (fileData && fileData[trimmedPair]) {
    await migrateFxRatesFromJson({ [trimmedPair]: fileData[trimmedPair] });
    const cachedResult = await getFxRate(trimmedPair, options.date);
    if (cachedResult && cachedResult.rate !== null) {
      return {
        pair: trimmedPair,
        rate: cachedResult.rate,
        date: cachedResult.date,
        requestedDate: cachedResult.requestedDate,
        source: 'file',
      };
    }
  }

  return {
    pair: trimmedPair,
    rate: null,
    date: null,
    requestedDate: options.date,
    source: 'none',
  };
};

export const updateFxRate = async (
  pair: string,
  rate: number,
  date?: string
): Promise<void> => {
  const trimmedPair = pair.trim().toUpperCase();
  if (trimmedPair.length !== 6) {
    throw new Error('FX pair must be 6 characters (e.g., USDJPY)');
  }
  if (!Number.isFinite(rate)) {
    throw new Error('Rate must be a finite number');
  }

  await storeFxRate(trimmedPair, rate, date);
};

