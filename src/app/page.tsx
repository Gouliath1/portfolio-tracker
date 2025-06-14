'use client';

import { useEffect, useState } from 'react';
import { rawPositions } from '../data/positions';
import { calculatePortfolioSummary } from '../utils/calculations';
import { PortfolioSummary as PortfolioSummaryType } from '../types/portfolio';
import { PortfolioSummary } from '../components/PortfolioSummary';
import { PerformanceChart } from '../components/PerformanceChart';
import { PositionsTable } from '../components/PositionsTable';

export default function Home() {
  const [portfolioSummary, setPortfolioSummary] = useState<PortfolioSummaryType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function loadData(showRefreshing = false) {
    if (showRefreshing) setRefreshing(true);
    try {
      const summary = await calculatePortfolioSummary(rawPositions);
      setPortfolioSummary(summary);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load portfolio data');
    } finally {
      setLoading(false);
      if (showRefreshing) setRefreshing(false);
    }
  }

  // Initial load
  useEffect(() => {
    loadData();
  }, []);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadData();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  if (loading) return <div className="min-h-screen p-8 bg-gray-100">Loading...</div>;
  if (error) return <div className="min-h-screen p-8 bg-gray-100">Error: {error}</div>;
  if (!portfolioSummary) return <div className="min-h-screen p-8 bg-gray-100">No data available</div>;

  return (
    <main className="min-h-screen p-8 bg-gray-100">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Portfolio Tracker</h1>
        <button 
          onClick={() => loadData(true)} 
          disabled={refreshing}
          className={`px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 disabled:opacity-50 disabled:cursor-not-allowed ${refreshing ? 'opacity-50' : ''}`}
        >
          {refreshing ? 'Refreshing...' : 'Refresh Prices'}
        </button>
      </div>
      <PortfolioSummary summary={portfolioSummary} />
      <div className="mb-8">
        <PerformanceChart positions={portfolioSummary.positions} />
      </div>
      <PositionsTable positions={portfolioSummary.positions} />
    </main>
  );
}
