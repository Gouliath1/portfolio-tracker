'use client';

import { useEffect, useState } from 'react';
import { loadPositions } from '../utils/positions';
import { calculatePortfolioSummary } from '../utils/calculations';
import { autoRefreshHistoricalDataIfNeeded } from '../utils/historicalDataChecker';
import { PortfolioSummary as PortfolioSummaryType } from '@portfolio/types';
import { PortfolioSummary } from '../components/layout/PortfolioSummary';
import { PerformanceChart } from '../components/charts/PerformanceChart';
import { PositionsTable } from '../components/tables/PositionsTable';
import DemoBanner from '../components/layout/DemoBanner';
import PositionSetManager from '../components/management/PositionSetManager';

export default function Home() {
  const [portfolioSummary, setPortfolioSummary] = useState<PortfolioSummaryType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'portfolio' | 'manage'>('portfolio');
  const [demoBannerRefresh, setDemoBannerRefresh] = useState(0);
  const [showValues, setShowValues] = useState(() => {
    // Initialize from localStorage, default to true
    const saved = typeof window !== 'undefined' ? localStorage.getItem('showValues') : null;
    return saved ? JSON.parse(saved) : true;
  });

  // Save showValues preference to localStorage
  useEffect(() => {
    localStorage.setItem('showValues', JSON.stringify(showValues));
  }, [showValues]);

  async function loadData(showRefreshing = false, forceRefresh = false) {
    if (showRefreshing) setRefreshing(true);
    try {
      // Load positions dynamically
      const currentPositions = await loadPositions();
      
      // Check and auto-refresh historical data if needed (only on initial load, not forced refresh)
      if (!forceRefresh && !showRefreshing) {
        console.log('🔍 Checking if historical data needs refresh...');
        const wasRefreshed = await autoRefreshHistoricalDataIfNeeded();
        if (wasRefreshed) {
          console.log('✅ Historical data was auto-refreshed');
        }
      }
      
      // Calculate portfolio summary with the loaded positions
      const summary = await calculatePortfolioSummary(currentPositions, forceRefresh);
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

  // // Auto-refresh every 30 seconds
  // useEffect(() => {
  //   const interval = setInterval(() => {
  //     loadData(false, false); // Regular update without force refresh
  //   }, 30000);

  //   return () => clearInterval(interval);
  // }, []);

  const handleRefreshClick = async () => {
    console.log(`🔴 FULL REFRESH BUTTON CLICKED at ${new Date().toISOString()}`);
    console.log(`🔴 This will refresh both current prices AND historical data`);
    setRefreshing(true);
    
    try {
      // First refresh current prices
      await loadData(false, true); // Force refresh current prices
      
      // Then refresh historical data
      console.log(`📈 Starting historical data refresh...`);
      const response = await fetch('/api/historical-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      console.log(`✅ Historical refresh completed:`, result);
      
      // Reload the data to show updated historical prices
      await loadData(false, false);
      
    } catch (error) {
      console.error('Error during refresh:', error);
      setError(error instanceof Error ? error.message : 'Failed to refresh data');
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) return <div className="min-h-screen p-8 bg-gray-100">Loading...</div>;
  if (error) return <div className="min-h-screen p-8 bg-gray-100">Error: {error}</div>;
  if (!portfolioSummary) return <div className="min-h-screen p-8 bg-gray-100">No data available</div>;

  return (
    <main className="min-h-screen p-8 bg-gray-100">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Portfolio Tracker</h1>
        <div className="flex items-center gap-4">
          {activeTab === 'portfolio' && (
            <>
              <button
                onClick={() => setShowValues(!showValues)}
                className={`px-4 py-2 rounded-lg ${
                  showValues ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'
                } text-white transition-colors`}
              >
                {showValues ? 'Hide Values' : 'Show Values'}
              </button>
              <button
                onClick={handleRefreshClick}
                disabled={refreshing}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-blue-300 transition-colors flex items-center gap-2"
              >
                {refreshing ? (
                  <>
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Refreshing All Data...
                  </>
                ) : (
                  'Refresh All Data'
                )}
              </button>
            </>
          )}
        </div>
      </div>

      <DemoBanner refreshTrigger={demoBannerRefresh} />

      {/* Tab Navigation */}
      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('portfolio')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'portfolio'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Portfolio Dashboard
            </button>
            <button
              onClick={() => setActiveTab('manage')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'manage'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Manage Position Sets
            </button>
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'portfolio' && (
        <div className="space-y-8">
          <PortfolioSummary summary={portfolioSummary} showValues={showValues} />
          <PerformanceChart positions={portfolioSummary.positions} showValues={showValues} />
          <PositionsTable positions={portfolioSummary.positions} showValues={showValues} />
        </div>
      )}

      {activeTab === 'manage' && (
        <PositionSetManager 
          onPositionSetChanged={() => {
            // Clear existing data immediately to show loading state
            setPortfolioSummary(null);
            setLoading(true);
            // Trigger demo banner refresh to show new status
            setDemoBannerRefresh(prev => prev + 1);
            // Refresh portfolio data when position set changes
            loadData(true, true);
            // Switch back to portfolio tab to see the updated data
            setActiveTab('portfolio');
          }}
        />
      )}
    </main>
  );
}
