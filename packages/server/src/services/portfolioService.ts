import { calculatePortfolioSummary } from '@portfolio/core';
import { PortfolioSummary, RawPosition } from '@portfolio/types';
import { getPositionsForActiveSet } from '../database/operations/positionsOperations';

export interface PortfolioSnapshotOptions {
  forceRefresh?: boolean;
}

export interface PortfolioSnapshot {
  summary: PortfolioSummary;
  rawPositions: RawPosition[];
  timestamp: string;
}

const createEmptySummary = (): PortfolioSummary => ({
  totalValueJPY: 0,
  totalCostJPY: 0,
  totalPnlJPY: 0,
  totalPnlPercentage: 0,
  positions: [],
});

export const getActivePositions = async (): Promise<RawPosition[]> => {
  return getPositionsForActiveSet();
};

export const getActivePortfolioSnapshot = async (
  options: PortfolioSnapshotOptions = {}
): Promise<PortfolioSnapshot> => {
  const rawPositions = await getActivePositions();

  if (rawPositions.length === 0) {
    return {
      rawPositions,
      summary: createEmptySummary(),
      timestamp: new Date().toISOString(),
    };
  }

  const summary = await calculatePortfolioSummary(
    rawPositions,
    options.forceRefresh ?? false
  );

  return {
    rawPositions,
    summary,
    timestamp: new Date().toISOString(),
  };
};
