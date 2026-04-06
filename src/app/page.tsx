'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { loadPositions } from '../utils/positions';
import { calculatePortfolioSummary } from '@portfolio/core';
import { autoRefreshHistoricalDataIfNeeded } from '../utils/historicalDataChecker';
import { PortfolioSummary as PortfolioSummaryType } from '@portfolio/types';
import { PortfolioSummary } from '../components/layout/PortfolioSummary';
import { PerformanceChart } from '../components/charts/PerformanceChart';
import { PositionsTable } from '../components/tables/PositionsTable';
import DemoBanner from '../components/layout/DemoBanner';
import PositionSetManager from '../components/management/PositionSetManager';

// ── Icons ────────────────────────────────────────────────────
const SunIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);

const MoonIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
  </svg>
);

const CloudOffIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M3 3l18 18M6.6 6.6A7 7 0 0118 13h1a3 3 0 01.7 5.9M9 17H5a4 4 0 01-.7-7.9A7 7 0 0112 5c.34 0 .68.02 1 .07" />
  </svg>
);

const RefreshIcon = ({ spinning }: { spinning: boolean }) => (
  <svg className={`w-4 h-4 ${spinning ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

// ── Component ────────────────────────────────────────────────
export default function Home() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [portfolioSummary, setPortfolioSummary] = useState<PortfolioSummaryType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'portfolio' | 'manage'>('portfolio');
  const [demoBannerRefresh, setDemoBannerRefresh] = useState(0);
  const [showValues, setShowValues] = useState(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('showValues') : null;
    return saved ? JSON.parse(saved) : true;
  });

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    localStorage.setItem('showValues', JSON.stringify(showValues));
  }, [showValues]);

  async function loadData(showRefreshing = false, forceRefresh = false) {
    if (showRefreshing) setRefreshing(true);
    try {
      const currentPositions = await loadPositions();
      if (!forceRefresh && !showRefreshing) {
        await autoRefreshHistoricalDataIfNeeded();
      }
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

  useEffect(() => { loadData(); }, []);

  const handleRefreshClick = async () => {
    setRefreshing(true);
    try {
      await loadData(false, true);
      const response = await fetch('/api/historical-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      await loadData(false, false);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to refresh data');
    } finally {
      setRefreshing(false);
    }
  };

  const hasStalePrice = portfolioSummary?.positions.some(p => p.currentPrice === null) ?? false;

  // ── Loading / error states ───────────────────────────────
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-10 h-10 border-2 rounded-full border-t-transparent mx-auto animate-spin"
          style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
        <p style={{ color: 'var(--text-secondary)' }}>Loading portfolio…</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="glass rounded-2xl p-8 max-w-md text-center space-y-3">
        <p style={{ color: 'var(--pnl-red)' }} className="font-semibold text-lg">Error</p>
        <p style={{ color: 'var(--text-secondary)' }}>{error}</p>
      </div>
    </div>
  );

  if (!portfolioSummary) return (
    <div className="min-h-screen flex items-center justify-center">
      <p style={{ color: 'var(--text-secondary)' }}>No data available</p>
    </div>
  );

  return (
    <main className="min-h-screen">
      {/* ── Header ───────────────────────────────────────── */}
      <header className="glass sticky top-0 z-50 px-6 py-4">
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between gap-4">
          {/* Title */}
          <h1 className="text-xl font-semibold tracking-tight tabular-nums"
            style={{ color: 'var(--text-primary)' }}>
            Portfolio<span style={{ color: 'var(--accent)' }}>Tracker</span>
          </h1>

          {/* Right controls */}
          <div className="flex items-center gap-2">
            {/* Stale price warning icon */}
            {hasStalePrice && (
              <div className="relative group">
                <button
                  className="p-2 rounded-lg transition-colors"
                  style={{ color: 'var(--pnl-red)' }}
                  aria-label="Some prices unavailable"
                >
                  <CloudOffIcon />
                </button>
                <div className="absolute right-0 top-full mt-2 w-64 glass rounded-xl px-4 py-3 text-xs pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50"
                  style={{ color: 'var(--text-secondary)' }}>
                  Some prices unavailable — showing last cached values
                </div>
              </div>
            )}

            {/* Show/hide values */}
            {activeTab === 'portfolio' && (
              <button
                onClick={() => setShowValues(!showValues)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all glass glass-hover"
                style={{ color: 'var(--text-secondary)' }}
              >
                {showValues ? 'Hide' : 'Show'} values
              </button>
            )}

            {/* Refresh */}
            {activeTab === 'portfolio' && (
              <button
                onClick={handleRefreshClick}
                disabled={refreshing}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                style={{
                  background: 'var(--accent-dim)',
                  color: 'var(--accent)',
                  border: '1px solid var(--accent-glow)',
                }}
              >
                <RefreshIcon spinning={refreshing} />
                {refreshing ? 'Refreshing…' : 'Refresh'}
              </button>
            )}

            {/* Theme toggle */}
            {mounted && (
              <button
                onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                className="p-2 rounded-lg glass glass-hover transition-all"
                style={{ color: 'var(--text-secondary)' }}
                aria-label="Toggle theme"
              >
                {resolvedTheme === 'dark' ? <SunIcon /> : <MoonIcon />}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Content ──────────────────────────────────────── */}
      <div className="max-w-screen-2xl mx-auto px-6 py-6 space-y-6">
        <DemoBanner refreshTrigger={demoBannerRefresh} />

        {/* Tab navigation */}
        <nav className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--glass-bg)', border: '1px solid var(--border)' }}>
          {(['portfolio', 'manage'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize"
              style={activeTab === tab ? {
                background: 'var(--accent-dim)',
                color: 'var(--accent)',
                border: '1px solid var(--accent-glow)',
              } : {
                color: 'var(--text-secondary)',
              }}
            >
              {tab === 'portfolio' ? 'Dashboard' : 'Manage Sets'}
            </button>
          ))}
        </nav>

        {/* Tab content */}
        {activeTab === 'portfolio' && (
          <div className="space-y-6">
            <PortfolioSummary summary={portfolioSummary} showValues={showValues} />
            <PerformanceChart positions={portfolioSummary.positions} showValues={showValues} />
            <PositionsTable positions={portfolioSummary.positions} showValues={showValues} />
          </div>
        )}

        {activeTab === 'manage' && (
          <PositionSetManager
            onPositionSetChanged={() => {
              setPortfolioSummary(null);
              setLoading(true);
              setDemoBannerRefresh(prev => prev + 1);
              loadData(true, true);
              setActiveTab('portfolio');
            }}
          />
        )}
      </div>
    </main>
  );
}
