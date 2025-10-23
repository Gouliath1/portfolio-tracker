import { useState, useEffect, useCallback } from 'react';
import type { PortfolioSnapshot } from '@portfolio/types';

export interface PortfolioData {
  snapshot: PortfolioSnapshot | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

// Temporary mock data for testing Phase 1
const createMockSnapshot = (): PortfolioSnapshot => ({
  rawPositions: [],
  summary: {
    totalValueJPY: 0,
    totalCostJPY: 0,
    totalPnlJPY: 0,
    totalPnlPercentage: 0,
    positions: [],
  },
  timestamp: new Date().toISOString(),
});

export function usePortfolioData(): PortfolioData {
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // TODO: Replace with real data fetching once React Native compatibility is resolved
      // Issue: @portfolio/core exports yahooFinanceApi which uses Node.js-specific modules
      // For now, return empty snapshot to test the UI
      console.log('[usePortfolioData] Loading mock data (database is empty)');
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate network delay
      const data = createMockSnapshot();

      // Validate data structure before setting
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid data structure received');
      }

      setSnapshot(data);
      console.log('[usePortfolioData] Mock data loaded successfully');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load portfolio data';
      console.error('[usePortfolioData] Error loading data:', err);

      // Instead of failing completely, set empty snapshot so UI still displays
      console.warn('[usePortfolioData] Setting empty snapshot to prevent UI failure');
      setSnapshot(createMockSnapshot());
      // Don't set error state - just log it and show empty data
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    snapshot,
    isLoading,
    error,
    refresh: loadData,
  };
}
