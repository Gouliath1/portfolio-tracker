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
  const [showValues, setShowValues] = useState(() => {
    // Initialize from localStorage, default to true
    const saved = typeof window !== 'undefined' ? localStorage.getItem('showValues') : null;
    return saved ? JSON.parse(saved) : true;
  });

  // Save showValues preference to localStorage
  useEffect(() => {
    localStorage.setItem('showValues', JSON.stringify(showValues));
  }, [showValues]);

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
        <h1 className="text-3xl font-bold text-gray-900">Portfolio Tracker</h1>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowValues(!showValues)}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {showValues ? 'Hide Values' : 'Show Values'}
          </button>
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="space-y-8">
        <PortfolioSummary summary={portfolioSummary} showValues={showValues} />
        <PerformanceChart positions={portfolioSummary.positions} showValues={showValues} />
        <PositionsTable positions={portfolioSummary.positions} showValues={showValues} />
      </div>
    </main>
  );
}
