'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { loadPositions } from '../utils/positions';
import { calculatePortfolioSummary } from '@portfolio/core';
import { readCachedSummary, writeCachedSummary } from '../utils/pnlCache';
import { PortfolioSummary as PortfolioSummaryType, Position, Transaction } from '@portfolio/types';
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
import SellPositionModal from '../components/management/SellPositionModal';
import { ClosedPositionsTable } from '../components/tables/ClosedPositionsTable';
import { getActiveSetId, exportSetTransactions, removeTransactionFromSet, insertTransactionIntoSet } from '../utils/localPositions';

interface UndoEntry {
  position: Position;       // for the toast label
  transaction: Transaction; // what to restore
  index: number;            // original index in the transactions array
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
  const [sellTarget, setSellTarget] = useState<{ position: Position; setId: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);
  const [demoBannerRefresh, setDemoBannerRefresh] = useState(0);
  const [undoEntry, setUndoEntry] = useState<UndoEntry | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showValues, setShowValues] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('showValues');
    if (saved !== null) setShowValues(JSON.parse(saved));
  }, []);

  const { currency, setCurrency, symbol, formatValue } = useBaseCurrency();

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    localStorage.setItem('showValues', JSON.stringify(showValues));
  }, [showValues]);

  const loadData = useCallback(async (showRefreshing = false, forceRefresh = false, baseCurrency = currency) => {
    if (showRefreshing) setRefreshing(true);
    try {
      const currentPositions = await loadPositions();

      // Tiered caching:
      //   1. Cache from today → just paint it and stop. Same-day reloads
      //      shouldn't recompute or hit the DB.
      //   2. Cache from an earlier day → paint instantly, then recompute
      //      in the background to refresh prices/FX, and overwrite.
      //   3. No cache → full compute path (DB → Yahoo if stale).
      //   4. forceRefresh (Refresh button) → bypass cache; recompute fetches
      //      live data and updates the cache.
      const isDev = process.env.NODE_ENV !== 'production';
      let cacheFromToday = false;
      if (!forceRefresh) {
        const cached = readCachedSummary(currentPositions, baseCurrency);
        if (cached) {
          setPortfolioSummary(cached.summary);
          setError(null);
          setLoading(false);
          cacheFromToday = cached.fromToday;
          if (isDev) console.log(`[pnl-cache] HIT — fromToday=${cached.fromToday}, positions=${currentPositions.length}, ccy=${baseCurrency}`);
        } else if (isDev) {
          console.log(`[pnl-cache] MISS — positions=${currentPositions.length}, ccy=${baseCurrency}`);
        }
      } else if (isDev) {
        console.log(`[pnl-cache] BYPASS — forceRefresh`);
      }

      if (cacheFromToday) {
        if (isDev) console.log('[pnl-cache] SKIPPING recompute — cache is from today');
        return; // skip recompute entirely
      }

      const summary = await calculatePortfolioSummary(currentPositions, forceRefresh, baseCurrency);
      setPortfolioSummary(summary);
      writeCachedSummary(currentPositions, baseCurrency, summary);
      setError(null);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load portfolio data');
      setLoading(false);
    } finally {
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
    const transactions = exportSetTransactions(id);
    const blob = new Blob([JSON.stringify(transactions, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${id}-transactions.json`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleDeletePosition = useCallback((position: Position) => {
    if (position.status === 'closed') {
      setActionError('Closed lots can’t be deleted from here — remove the underlying sell transaction from the exported JSON instead.');
      return;
    }
    if (position.txBuyIndex === undefined) return;

    const setId = getActiveSetId();
    const txs = exportSetTransactions(setId);
    const buyTx = txs[position.txBuyIndex];
    if (!buyTx || buyTx.way !== 'buy') return;

    // Block deletion if FIFO has matched any portion of this buy to a sell.
    if (position.quantity < buyTx.quantity) {
      setActionError(`Cannot delete this buy — ${buyTx.quantity - position.quantity} of ${buyTx.quantity} have already been sold (FIFO). Delete the sells first.`);
      return;
    }

    const result = removeTransactionFromSet(setId, position.txBuyIndex);
    if (!result) return;

    // Optimistic UI: drop this lot from the open list. Realized totals are unaffected
    // since fully-unsold buys don't contribute to closed lots.
    setPortfolioSummary(prev => {
      if (!prev) return prev;
      const positions = prev.positions.filter(p => p !== position);
      const totalCostJPY = positions.reduce((s, p) => s + p.costInJPY, 0);
      const totalValueJPY = positions.reduce((s, p) => s + p.currentValueJPY, 0);
      const totalPnlJPY = totalValueJPY - totalCostJPY;
      const totalPnlPercentage = totalCostJPY === 0 ? 0 : (totalPnlJPY / totalCostJPY) * 100;
      return { ...prev, positions, totalCostJPY, totalValueJPY, totalPnlJPY, totalPnlPercentage };
    });

    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoEntry({ position, transaction: result.removed, index: position.txBuyIndex, setId: result.actualSetId });

    undoTimerRef.current = setTimeout(() => {
      setUndoEntry(null);
      handlePositionSetChanged(true);
    }, 5000);
  }, [handlePositionSetChanged]);

  const handleSellPosition = useCallback((position: Position) => {
    setSellTarget({ position, setId: getActiveSetId() });
  }, []);

  const handleUndo = useCallback(() => {
    if (!undoEntry) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    insertTransactionIntoSet(undoEntry.setId, undoEntry.transaction, undoEntry.index);
    // Restore in UI optimistically: re-add the open lot.
    setPortfolioSummary(prev => {
      if (!prev) return prev;
      const positions = [...prev.positions, undoEntry.position];
      const totalCostJPY = positions.reduce((s, p) => s + p.costInJPY, 0);
      const totalValueJPY = positions.reduce((s, p) => s + p.currentValueJPY, 0);
      const totalPnlJPY = totalValueJPY - totalCostJPY;
      const totalPnlPercentage = totalCostJPY === 0 ? 0 : (totalPnlJPY / totalCostJPY) * 100;
      return { ...prev, positions, totalCostJPY, totalValueJPY, totalPnlJPY, totalPnlPercentage };
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
        <header className="sticky top-0 z-30 px-4 sm:px-6 py-3 sm:py-4" style={{ background: 'var(--surface-header)', borderBottom: '1px solid var(--border)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
          <div className="max-w-screen-2xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
            {/* Title */}
            <h1 className="text-lg sm:text-xl font-semibold tracking-tight flex-shrink-0"
              style={{ color: 'var(--text-primary)' }}>
              Portfolio<span style={{ color: 'var(--accent)' }}>Tracker</span>
            </h1>

            {/* Right controls */}
            <div className="flex items-center gap-1.5 sm:gap-2">
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
                    <MdCloudOff size={18} />
                  </button>
                  <div className="absolute right-0 top-full mt-2 w-56 glass rounded-xl px-4 py-3 text-xs pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50"
                    style={{ color: 'var(--text-secondary)' }}>
                    Some prices unavailable — showing last cached values
                  </div>
                </div>
              )}

              {/* Show/hide values */}
              <button
                onClick={() => setShowValues(!showValues)}
                className="p-2 sm:px-3 sm:py-1.5 rounded-lg text-sm font-medium transition-all glass glass-hover"
                style={{ color: 'var(--text-secondary)' }}
                aria-label={showValues ? 'Hide values' : 'Show values'}
              >
                <span className="hidden sm:inline">{showValues ? 'Hide' : 'Show'} values</span>
                <span className="sm:hidden">{showValues ? '🙈' : '👁'}</span>
              </button>

              {/* Refresh */}
              <button
                onClick={handleRefreshClick}
                disabled={refreshing}
                className="flex items-center gap-1.5 p-2 sm:px-3 sm:py-1.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                style={{
                  background: 'var(--accent-dim)',
                  color: 'var(--accent)',
                  border: '1px solid var(--accent-glow)',
                }}
              >
                <MdRefresh size={16} className={refreshing ? 'animate-spin' : ''} />
                <span className="hidden sm:inline">{refreshing ? 'Refreshing…' : 'Refresh'}</span>
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
        <div className="max-w-screen-2xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
          <DemoBanner refreshTrigger={demoBannerRefresh} />
          <PortfolioSummary summary={portfolioSummary} showValues={showValues} symbol={symbol} formatValue={formatValue} />
          <div className="hidden sm:block">
            <PerformanceChart positions={portfolioSummary.positions} showValues={showValues} currency={currency} symbol={symbol} />
          </div>

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
            onSellPosition={handleSellPosition}
          />

          <ClosedPositionsTable
            positions={portfolioSummary.closedPositions}
            showValues={showValues}
            baseCurrency={currency}
            realizedPnlJPY={portfolioSummary.realizedPnlJPY}
            realizedCostJPY={portfolioSummary.realizedCostJPY}
            realizedPnlPercentage={portfolioSummary.realizedPnlPercentage}
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
            if (wasActive) {
              handlePositionSetChanged();
            } else {
              // The active portfolio didn't change — don't refetch its data.
              // Just bump the refresh trigger so the set list in Settings and
              // the demo banner re-read localStorage and pick up the new set.
              setDemoBannerRefresh(prev => prev + 1);
              setActionInfo(`Imported ${count} transactions — switch to the new set in Settings to view it.`);
              setTimeout(() => setActionInfo(null), 5000);
            }
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

      {/* ── Sell position modal ──────────────────────────── */}
      {sellTarget && (
        <SellPositionModal
          setId={sellTarget.setId}
          position={sellTarget.position}
          onSaved={() => {
            setSellTarget(null);
            handlePositionSetChanged();
          }}
          onClose={() => setSellTarget(null)}
        />
      )}

      {/* ── Action error toast ───────────────────────────── */}
      {actionError && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl max-w-md"
          style={{
            background: 'var(--surface-popover)',
            border: '1px solid var(--pnl-red)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
        >
          <span className="text-sm" style={{ color: 'var(--pnl-red)' }}>{actionError}</span>
          <button
            onClick={() => setActionError(null)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all glass glass-hover"
            style={{ color: 'var(--text-secondary)' }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Action info toast (auto-dismiss) ─────────────── */}
      {actionInfo && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl max-w-md"
          style={{
            background: 'var(--surface-popover)',
            border: '1px solid var(--accent-glow)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
        >
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{actionInfo}</span>
          <button
            onClick={() => setActionInfo(null)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all glass glass-hover"
            style={{ color: 'var(--text-secondary)' }}
          >
            Dismiss
          </button>
        </div>
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
        refreshTrigger={demoBannerRefresh}
      />
    </>
  );
}
