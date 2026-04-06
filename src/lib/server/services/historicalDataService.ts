import { refreshAllHistoricalData, refreshFxRatesForDates } from '@portfolio/core';
import { getDbClient } from '../database/config';
import { getActivePositions } from './portfolioService';
import { RawPosition } from '@portfolio/types';

interface HistoricalPosition {
  transactionDate: string;
  ticker: string;
  transactionCcy?: string;
}

export class NoPositionsAvailableError extends Error {
  constructor() {
    super('No positions available for historical refresh');
    this.name = 'NoPositionsAvailableError';
  }
}

export interface HistoricalRefreshResult {
  historicalResults: { [symbol: string]: { [date: string]: number } | null };
  fxResults: { [fxPair: string]: { [date: string]: number } | null };
  positionsProcessed: number;
}

const mapPositionsForHistory = (positions: RawPosition[]): HistoricalPosition[] => {
  return positions.map(position => {
    const rawDate = position.transactionDate || '1970-01-01';
    const normalizedDate = rawDate.includes('-') ? rawDate : rawDate.replace(/\//g, '-');

    return {
      ticker: position.ticker.toString(),
      transactionDate: normalizedDate,
      transactionCcy: position.transactionCcy,
    };
  });
};

export const refreshHistoricalDataForActivePortfolio = async (): Promise<HistoricalRefreshResult> => {
  const rawPositions = await getActivePositions();

  if (rawPositions.length === 0) {
    throw new NoPositionsAvailableError();
  }

  const historicalPositions = mapPositionsForHistory(rawPositions);

  const historicalResults = await refreshAllHistoricalData(historicalPositions);

  const validHistoricalResults: { [symbol: string]: { [date: string]: number } } = {};
  for (const [symbol, data] of Object.entries(historicalResults)) {
    if (data !== null) {
      validHistoricalResults[symbol] = data;
    }
  }

  const fxResults = await refreshFxRatesForDates(validHistoricalResults, historicalPositions);

  return {
    historicalResults,
    fxResults,
    positionsProcessed: rawPositions.length,
  };
};

export interface HistoricalDataSummary {
  historicalPrices: number;
  fxRates: number;
  securitiesWithData: number;
  lastDataDate: string | null;
  daysSinceLastData: number;
}

export const getHistoricalDataSummary = async (): Promise<HistoricalDataSummary> => {
  const client = getDbClient();

  const [pricesCount, fxCount, securitiesCount, recentPriceResult] = await Promise.all([
    client.execute('SELECT COUNT(*) as count FROM securities_prices'),
    client.execute('SELECT COUNT(*) as count FROM fx_rates'),
    client.execute('SELECT COUNT(DISTINCT security_id) as count FROM securities_prices'),
    client.execute('SELECT MAX(price_date) as latest_date FROM securities_prices'),
  ]);

  const lastDataDate = (recentPriceResult.rows[0]?.latest_date as string | null) ?? null;
  let daysSinceLastData = 0;

  if (lastDataDate) {
    const lastDate = new Date(lastDataDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    lastDate.setHours(0, 0, 0, 0);
    daysSinceLastData = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  return {
    historicalPrices: Number(pricesCount.rows[0].count ?? 0),
    fxRates: Number(fxCount.rows[0].count ?? 0),
    securitiesWithData: Number(securitiesCount.rows[0].count ?? 0),
    lastDataDate,
    daysSinceLastData,
  };
};
