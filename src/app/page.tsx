'use client';

import { useEffect, useState } from 'react';
import { loadPositions } from '../utils/positions';
import { calculatePortfolioSummary } from '@portfolio/core';
import { autoRefreshHistoricalDataIfNeeded } from '../utils/historicalDataChecker';
import { PortfolioSummary as PortfolioSummaryType } from '@portfolio/types';
import { PortfolioSummary } from '../components/layout/PortfolioSummary';
import { PerformanceChart } from '../components/charts/PerformanceChart';
import { PositionsTable } from '../components/tables/PositionsTable';
import DemoBanner from '../components/layout/DemoBanner';
import { SettingsPanel } from '../components/layout/SettingsPanel';
import { MdCloudOff, MdRefresh, MdSettings } from 'react-icons/md';

// ── Component ────────────────────────────────────────────────
export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [portfolioSummary, setPortfolioSummary] = useState<PortfolioSummaryType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
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

  const handlePositionSetChanged = () => {
    setPortfolioSummary(null);
    setLoading(true);
    setDemoBannerRefresh(prev => prev + 1);
    loadData(true, true);
  };

  const hasStalePrice = portfolioSummary?.positions.some(p => p.currentPrice === null) ?? false;

  // ── Loading / error states ───────────────────────────────
  if (!mounted || loading) return (
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
    <>
      <main className="min-h-screen">
        {/* ── Header ───────────────────────────────────────── */}
        <header className="sticky top-0 z-30 px-6 py-4" style={{ background: 'var(--surface-header)', borderBottom: '1px solid var(--border)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
          <div className="max-w-screen-2xl mx-auto flex items-center justify-between gap-4">
            {/* Title */}
            <h1 className="text-xl font-semibold tracking-tight"
              style={{ color: 'var(--text-primary)' }}>
              Portfolio<span style={{ color: 'var(--accent)' }}>Tracker</span>
            </h1>

            {/* Right controls */}
            <div className="flex items-center gap-2">
              {/* Stale price warning */}
              {hasStalePrice && (
                <div className="relative group">
                  <button
                    className="p-2 rounded-lg transition-colors"
                    style={{ color: 'var(--pnl-red)' }}
                    aria-label="Some prices unavailable"
                  >
                    <MdCloudOff size={20} />
                  </button>
                  <div className="absolute right-0 top-full mt-2 w-64 glass rounded-xl px-4 py-3 text-xs pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50"
                    style={{ color: 'var(--text-secondary)' }}>
                    Some prices unavailable — showing last cached values
                  </div>
                </div>
              )}

              {/* Show/hide values */}
              <button
                onClick={() => setShowValues(!showValues)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all glass glass-hover"
                style={{ color: 'var(--text-secondary)' }}
              >
                {showValues ? 'Hide' : 'Show'} values
              </button>

              {/* Refresh */}
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
                <MdRefresh size={16} className={refreshing ? 'animate-spin' : ''} />
                {refreshing ? 'Refreshing…' : 'Refresh'}
              </button>

              {/* Settings */}
              <button
                onClick={() => setSettingsOpen(true)}
                className="p-2 rounded-lg glass glass-hover transition-all"
                style={{ color: 'var(--text-secondary)' }}
                aria-label="Open settings"
              >
                <MdSettings size={20} />
              </button>
            </div>
          </div>
        </header>

        {/* ── Content ──────────────────────────────────────── */}
        <div className="max-w-screen-2xl mx-auto px-6 py-6 space-y-6">
          <DemoBanner refreshTrigger={demoBannerRefresh} />
          <PortfolioSummary summary={portfolioSummary} showValues={showValues} />
          <PerformanceChart positions={portfolioSummary.positions} showValues={showValues} />
          <PositionsTable positions={portfolioSummary.positions} showValues={showValues} />
        </div>
      </main>

      {/* ── Settings panel ───────────────────────────────── */}
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onPositionSetChanged={handlePositionSetChanged}
      />
    </>
  );
}
