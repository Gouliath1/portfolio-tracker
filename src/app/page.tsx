'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { loadPositions } from '../utils/positions';
import { calculatePortfolioSummary } from '@portfolio/core';
import { autoRefreshHistoricalDataIfNeeded } from '../utils/historicalDataChecker';
import { PortfolioSummary as PortfolioSummaryType, Position } from '@portfolio/types';
import { PortfolioSummary } from '../components/layout/PortfolioSummary';
import { PerformanceChart } from '../components/charts/PerformanceChart';
import { PositionsTable } from '../components/tables/PositionsTable';
import DemoBanner from '../components/layout/DemoBanner';
import WelcomeModal from '../components/layout/WelcomeModal';
import { SettingsPanel } from '../components/layout/SettingsPanel';
import { useBaseCurrency } from '../hooks/useBaseCurrency';
import { MdCloudOff, MdRefresh, MdSettings, MdUpload, MdAdd, MdDownload, MdUndo } from 'react-icons/md';
import ImportSetModal from '../components/management/ImportSetModal';
import AddPositionModal from '../components/management/AddPositionModal';
import { getActiveSetId, exportSetPositions, removePositionFromSet, insertPositionIntoSet } from '../utils/localPositions';

interface UndoEntry {
  position: Position;
  index: number;
  setId: string;
}

// ── Component ────────────────────────────────────────────────
export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [portfolioSummary, setPortfolioSummary] = useState<PortfolioSummaryType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [addPositionOpen, setAddPositionOpen] = useState(false);
  const [demoBannerRefresh, setDemoBannerRefresh] = useState(0);
  const [undoEntry, setUndoEntry] = useState<UndoEntry | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showValues, setShowValues] = useState(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('showValues') : null;
    return saved ? JSON.parse(saved) : true;
  });

  const { currency, setCurrency, symbol, formatValue } = useBaseCurrency();

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    localStorage.setItem('showValues', JSON.stringify(showValues));
  }, [showValues]);

  const loadData = useCallback(async (showRefreshing = false, forceRefresh = false, baseCurrency = currency) => {
    if (showRefreshing) setRefreshing(true);
    try {
      const currentPositions = await loadPositions();
      if (!forceRefresh && !showRefreshing) {
        await autoRefreshHistoricalDataIfNeeded();
      }
      const summary = await calculatePortfolioSummary(currentPositions, forceRefresh, baseCurrency);
      setPortfolioSummary(summary);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load portfolio data');
    } finally {
      setLoading(false);
      if (showRefreshing) setRefreshing(false);
    }
  }, [currency]);

  useEffect(() => { loadData(); }, [loadData]);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh data');
    } finally {
      setRefreshing(false);
    }
  };

  const handlePositionSetChanged = useCallback((silent = false) => {
    if (!silent) {
      setPortfolioSummary(null);
      setLoading(true);
    }
    setDemoBannerRefresh(prev => prev + 1);
    loadData(!silent, !silent);
  }, [loadData]);

  const handleCurrencyChange = (next: Parameters<typeof setCurrency>[0]) => {
    setCurrency(next);
    setPortfolioSummary(null);
    setLoading(true);
    loadData(false, false, next);
  };

  const handleExportActive = () => {
    const id = getActiveSetId();
    const positions = exportSetPositions(id);
    const blob = new Blob([JSON.stringify(positions, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${id}-positions.json`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleDeletePosition = useCallback((position: Position) => {
    const setId = getActiveSetId();
    const rawPositions = exportSetPositions(setId);
    const index = rawPositions.findIndex(
      p => String(p.ticker) === String(position.ticker) &&
           p.transactionDate === position.transactionDate &&
           p.quantity === position.quantity &&
           p.costPerUnit === position.costPerUnit
    );
    if (index === -1) return;

    const result = removePositionFromSet(setId, index);
    if (!result) return;

    // Optimistic UI: splice position out of current summary without reloading
    setPortfolioSummary(prev => {
      if (!prev) return prev;
      const positions = prev.positions.filter(p => p !== position);
      const totalCostJPY = positions.reduce((s, p) => s + p.costInJPY, 0);
      const totalValueJPY = positions.reduce((s, p) => s + p.currentValueJPY, 0);
      const totalPnlJPY = totalValueJPY - totalCostJPY;
      const totalPnlPercentage = totalCostJPY === 0 ? 0 : (totalPnlJPY / totalCostJPY) * 100;
      return { positions, totalCostJPY, totalValueJPY, totalPnlJPY, totalPnlPercentage };
    });

    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    // Use actualSetId so undo knows the real set (post demo-promotion if applicable)
    setUndoEntry({ position, index, setId: result.actualSetId });

    // After 5s, confirm deletion with a silent background reload
    undoTimerRef.current = setTimeout(() => {
      setUndoEntry(null);
      handlePositionSetChanged(true);
    }, 5000);
  }, [handlePositionSetChanged]);

  const handleUndo = useCallback(() => {
    if (!undoEntry) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    // Restore in localStorage
    insertPositionIntoSet(undoEntry.setId, undoEntry.position, undoEntry.index);
    // Restore in UI optimistically
    setPortfolioSummary(prev => {
      if (!prev) return prev;
      const positions = [
        ...prev.positions.slice(0, undoEntry.index),
        undoEntry.position,
        ...prev.positions.slice(undoEntry.index),
      ];
      const totalCostJPY = positions.reduce((s, p) => s + p.costInJPY, 0);
      const totalValueJPY = positions.reduce((s, p) => s + p.currentValueJPY, 0);
      const totalPnlJPY = totalValueJPY - totalCostJPY;
      const totalPnlPercentage = totalCostJPY === 0 ? 0 : (totalPnlJPY / totalCostJPY) * 100;
      return { positions, totalCostJPY, totalValueJPY, totalPnlJPY, totalPnlPercentage };
    });
    setUndoEntry(null);
  }, [undoEntry]);

  // Cleanup undo timer on unmount
  useEffect(() => () => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current); }, []);

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
              {/* Active currency badge */}
              <span className="px-2 py-1 rounded-md text-xs font-mono font-semibold"
                style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-glow)' }}>
                {currency}
              </span>

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
          <PortfolioSummary summary={portfolioSummary} showValues={showValues} symbol={symbol} formatValue={formatValue} />
          <PerformanceChart positions={portfolioSummary.positions} showValues={showValues} currency={currency} symbol={symbol} />

          {/* ── Data actions toolbar ─────────────────────────── */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setImportModalOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
              style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent)' }}
            >
              <MdUpload size={15} />
              Import set
            </button>
            <button
              onClick={() => setAddPositionOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium glass glass-hover transition-all"
              style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              <MdAdd size={15} />
              Add position
            </button>
            <button
              onClick={handleExportActive}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium glass glass-hover transition-all"
              style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              <MdDownload size={15} />
              Export
            </button>
          </div>

          <PositionsTable
            positions={portfolioSummary.positions}
            showValues={showValues}
            baseCurrency={currency}
            onDeletePosition={handleDeletePosition}
          />
        </div>
      </main>

      {/* ── Undo toast ───────────────────────────────────────── */}
      {undoEntry && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl"
          style={{
            background: 'var(--surface-popover)',
            border: '1px solid var(--border-strong)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
        >
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            <span style={{ color: 'var(--text-primary)' }}>{String(undoEntry.position.ticker)}</span> removed
          </span>
          <button
            onClick={handleUndo}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-glow)' }}
          >
            <MdUndo size={15} />
            Undo
          </button>
        </div>
      )}

      {/* ── Import set modal ─────────────────────────────── */}
      {importModalOpen && (
        <ImportSetModal
          onImported={(count, wasActive) => {
            setImportModalOpen(false);
            setDemoBannerRefresh(prev => prev + 1);
            if (wasActive) handlePositionSetChanged();
          }}
          onClose={() => setImportModalOpen(false)}
        />
      )}

      {/* ── Add position modal ───────────────────────────── */}
      {addPositionOpen && (
        <AddPositionModal
          setId={getActiveSetId()}
          onSaved={() => {
            setAddPositionOpen(false);
            handlePositionSetChanged();
          }}
          onClose={() => setAddPositionOpen(false)}
        />
      )}

      {/* ── Welcome modal (first visit only) ────────────── */}
      <WelcomeModal onOpenSettings={() => setSettingsOpen(true)} />

      {/* ── Settings panel ───────────────────────────────── */}
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onPositionSetChanged={handlePositionSetChanged}
        currency={currency}
        onCurrencyChange={handleCurrencyChange}
      />
    </>
  );
}
