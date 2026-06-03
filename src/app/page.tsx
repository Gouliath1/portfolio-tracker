'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { loadPositions } from '../utils/positions';
import { calculatePortfolioSummary } from '@portfolio/core';
import { readCachedSummary, writeCachedSummary, clearChartCache } from '../utils/pnlCache';
import { PortfolioSummary as PortfolioSummaryType, Position, Transaction } from '@portfolio/types';
import { PortfolioSummary } from '../components/layout/PortfolioSummary';
import { PerformanceChart } from '../components/charts/PerformanceChart';
import { AnalyticsPanel } from '../components/overview/AnalyticsPanel';
import { BenchmarkCard } from '../components/overview/BenchmarkCard';
import { PortfolioHealthCard } from '../components/overview/PortfolioHealthCard';
import { PositionsTable } from '../components/tables/PositionsTable';
import DemoBanner from '../components/layout/DemoBanner';
import WelcomeModal from '../components/layout/WelcomeModal';
import { SettingsPanel } from '../components/layout/SettingsPanel';
import { AppSidebar } from '../components/layout/AppSidebar';
import { useBaseCurrency } from '../hooks/useBaseCurrency';
import {
    MdCloudOff, MdRefresh, MdSettings, MdUpload, MdAdd, MdUndo,
    MdHome, MdAccountBalance, MdHistory, MdTune, MdTrendingUp,
    MdVisibility, MdVisibilityOff,
} from 'react-icons/md';

import ImportSetModal from '../components/management/ImportSetModal';
import AddPositionModal from '../components/management/AddPositionModal';
import SellPositionModal from '../components/management/SellPositionModal';
import PositionSetManager from '../components/management/PositionSetManager';
import { ClosedPositionsTable } from '../components/tables/ClosedPositionsTable';
import { getActiveSetId, exportSetTransactions, removeTransactionFromSet, insertTransactionIntoSet } from '../utils/localPositions';

import type { SidebarViewId } from '../components/layout/AppSidebar';
type ViewId = SidebarViewId;

const NAV_ITEMS = [
    { id: 'overview'     as const, label: 'Overview',  icon: MdHome },
    { id: 'holdings'     as const, label: 'Holdings',  icon: MdAccountBalance },
    { id: 'closed'       as const, label: 'Closed',    icon: MdHistory },
    { id: 'transactions' as const, label: 'Manage',    icon: MdTune },
];

interface UndoEntry {
    position: Position;
    transaction: Transaction;
    index: number;
    setId: string;
}

export default function Home() {
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
    const [activeView, setActiveView] = useState<ViewId>('overview');

    useEffect(() => {
        const saved = localStorage.getItem('showValues');
        if (saved !== null) setShowValues(JSON.parse(saved));
    }, []);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const v = params.get('view');
        if (v === 'holdings' || v === 'closed' || v === 'transactions' || v === 'overview') {
            setActiveView(v);
        }
        if (params.get('settings') === '1') {
            setSettingsOpen(true);
            // Drop the flag so a reload doesn't reopen it
            history.replaceState(null, '', '/');
        }
    }, []);

    useEffect(() => {
        history.replaceState(null, '', activeView === 'overview' ? '/' : `/?view=${activeView}`);
    }, [activeView]);

    const { currency, setCurrency, symbol, formatValue } = useBaseCurrency();

    useEffect(() => {
        localStorage.setItem('showValues', JSON.stringify(showValues));
    }, [showValues]);

    const loadData = useCallback(async (showRefreshing = false, forceRefresh = false, baseCurrency = currency) => {
        if (showRefreshing) setRefreshing(true);
        try {
            const currentPositions = await loadPositions();

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
                return;
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
        clearChartCache();
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

    const handleDeletePosition = useCallback((position: Position) => {
        if (position.status === 'closed') {
            setActionError('Closed lots can\'t be deleted from here — remove the underlying sell transaction from the exported JSON instead.');
            return;
        }
        if (position.txBuyIndex === undefined) return;

        const setId = getActiveSetId();
        const txs = exportSetTransactions(setId);
        const buyTx = txs[position.txBuyIndex];
        if (!buyTx || buyTx.way !== 'buy') return;

        if (position.quantity < buyTx.quantity) {
            setActionError(`Cannot delete this buy — ${buyTx.quantity - position.quantity} of ${buyTx.quantity} have already been sold (FIFO). Delete the sells first.`);
            return;
        }

        const result = removeTransactionFromSet(setId, position.txBuyIndex);
        if (!result) return;

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

    useEffect(() => () => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current); }, []);

    const placeholderSummary: PortfolioSummaryType = {
        totalValueJPY: 0, totalCostJPY: 0, totalPnlJPY: 0, totalPnlPercentage: 0,
        positions: [], closedPositions: [], realizedPnlJPY: 0,
        realizedCostJPY: 0, realizedPnlPercentage: 0, totalDividendsJPY: 0,
    };
    const summary = portfolioSummary ?? placeholderSummary;
    const isFirstLoad = loading && !portfolioSummary;

    const hasStalePrice = summary.positions.some(p => p.currentPrice === null);

    return (
        <>
            <div className="flex min-h-screen" style={{ background: 'var(--bg-base)' }}>

                <AppSidebar
                    activePage="home"
                    activeView={activeView}
                    onViewChange={setActiveView}
                    onSettingsClick={() => setSettingsOpen(true)}
                    currency={currency}
                />

                {/* ── Content column ───────────────────────────────── */}
                <div className="flex-1 min-w-0 md:ml-[200px] flex flex-col min-h-screen">

                    {/* ── Header ───────────────────────────────────── */}
                    <header
                        className="sticky top-0 z-10 px-4 sm:px-6 h-[52px] flex items-center"
                        style={{ background: 'var(--surface-header)', borderBottom: '1px solid var(--border)' }}
                    >
                        <div className="w-full flex items-center gap-4">
                            {/* Mobile: show logo */}
                            <h1 className="md:hidden text-base font-semibold tracking-tight flex-shrink-0"
                                style={{ color: 'var(--text-primary)' }}>
                                Portfolio<span style={{ color: 'var(--accent)' }}>Tracker</span>
                            </h1>

                            {/* Controls — push right */}
                            <div className="flex items-center gap-2 ml-auto">
                                {/* Currency pill — mobile only (sidebar shows it on desktop) */}
                                <span className="md:hidden px-2 py-0.5 rounded text-xs font-mono font-semibold"
                                    style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                                    {currency}
                                </span>

                                {/* Settings — mobile only (sidebar shows it on desktop) */}
                                <button
                                    onClick={() => setSettingsOpen(true)}
                                    className="md:hidden p-2 rounded-lg"
                                    style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                                    aria-label="Open settings"
                                >
                                    <MdSettings size={18} />
                                </button>

                                {/* Stale price warning */}
                                {hasStalePrice && (
                                    <div className="relative group">
                                        <button
                                            className="p-2 rounded-lg"
                                            style={{ color: 'var(--pnl-red)' }}
                                            aria-label="Some prices unavailable"
                                        >
                                            <MdCloudOff size={18} />
                                        </button>
                                        <div className="absolute right-0 top-full mt-2 w-56 rounded-xl px-4 py-3 text-xs pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50"
                                            style={{ color: 'var(--text-secondary)', background: 'var(--surface-popover)', border: '1px solid var(--border)' }}>
                                            Some prices unavailable — showing last cached values
                                        </div>
                                    </div>
                                )}

                                {/* Show/hide values */}
                                <button
                                    onClick={() => setShowValues(!showValues)}
                                    className="flex items-center gap-1.5 p-2 sm:px-3 sm:py-1.5 rounded-lg text-sm font-medium transition-all"
                                    style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                                    aria-label={showValues ? 'Hide values' : 'Show values'}
                                >
                                    {showValues ? <MdVisibilityOff size={16} /> : <MdVisibility size={16} />}
                                    <span className="hidden sm:inline">{showValues ? 'Hide' : 'Show'}</span>
                                </button>

                                {/* Refresh */}
                                <button
                                    onClick={handleRefreshClick}
                                    disabled={refreshing}
                                    className="flex items-center gap-1.5 p-2 sm:px-3 sm:py-1.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                                    style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-glow)' }}
                                >
                                    <MdRefresh size={16} className={refreshing ? 'animate-spin' : ''} />
                                    <span className="hidden sm:inline">{refreshing ? 'Refreshing…' : 'Refresh'}</span>
                                </button>
                            </div>
                        </div>
                    </header>

                    {/* ── Main content ─────────────────────────────── */}
                    <main className="flex-1 pb-20 md:pb-0">
                        <div className="max-w-screen-xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
                            <DemoBanner refreshTrigger={demoBannerRefresh} />

                            {/* Loading state (overview renders chrome immediately; other views show spinner) */}
                            {loading && activeView !== 'overview' && (
                                <div className="flex items-center justify-center py-24">
                                    <div className="text-center space-y-4">
                                        <div className="w-8 h-8 rounded-full border-2 border-t-transparent mx-auto animate-spin"
                                            style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
                                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading portfolio…</p>
                                    </div>
                                </div>
                            )}

                            {/* Error state */}
                            {!loading && error && (
                                <div className="flex items-center justify-center py-24 px-8">
                                    <div className="rounded-xl p-8 max-w-md text-center space-y-3"
                                        style={{ background: 'var(--surface)', border: '1px solid var(--pnl-red)' }}>
                                        <p className="font-semibold" style={{ color: 'var(--pnl-red)' }}>Error</p>
                                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{error}</p>
                                    </div>
                                </div>
                            )}

                            {/* Overview: KPIs render immediately with placeholder; chart waits for data */}
                            {activeView === 'overview' && (
                                <>
                                    <PortfolioSummary
                                        summary={summary}
                                        isLoading={isFirstLoad}
                                        showValues={showValues}
                                        symbol={symbol}
                                        currency={currency}
                                        formatValue={formatValue}
                                    />
                                    {!loading && portfolioSummary && (
                                        <>
                                            <div className="grid grid-cols-1 lg:grid-cols-7 gap-4 items-start">
                                                <div className="lg:col-span-5 min-w-0">
                                                    <PerformanceChart
                                                        positions={portfolioSummary.positions}
                                                        showValues={showValues}
                                                        currency={currency}
                                                        symbol={symbol}
                                                    />
                                                </div>
                                                <div className="lg:col-span-2 min-w-0">
                                                    <AnalyticsPanel
                                                        summary={portfolioSummary}
                                                        symbol={symbol}
                                                        formatValue={formatValue}
                                                        showValues={showValues}
                                                    />
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <BenchmarkCard summary={portfolioSummary} baseCurrency={currency} />
                                                <PortfolioHealthCard
                                                    positions={portfolioSummary.positions}
                                                    totalValueJPY={portfolioSummary.totalValueJPY}
                                                />
                                            </div>
                                        </>
                                    )}
                                </>
                            )}

                            {/* Holdings: open positions */}
                            {!loading && portfolioSummary && activeView === 'holdings' && (
                                <>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setAddPositionOpen(true)}
                                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                                            style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-glow)' }}
                                        >
                                            <MdAdd size={15} />
                                            Add position
                                        </button>
                                    </div>
                                    <PositionsTable
                                        positions={portfolioSummary.positions}
                                        showValues={showValues}
                                        baseCurrency={currency}
                                        onDeletePosition={handleDeletePosition}
                                        onSellPosition={handleSellPosition}
                                    />
                                </>
                            )}

                            {/* Closed positions */}
                            {!loading && portfolioSummary && activeView === 'closed' && (
                                <ClosedPositionsTable
                                    positions={portfolioSummary.closedPositions}
                                    showValues={showValues}
                                    baseCurrency={currency}
                                    realizedPnlJPY={portfolioSummary.realizedPnlJPY}
                                    realizedCostJPY={portfolioSummary.realizedCostJPY}
                                    realizedPnlPercentage={portfolioSummary.realizedPnlPercentage}
                                />
                            )}

                            {/* Transactions: data management */}
                            {!loading && portfolioSummary && activeView === 'transactions' && (
                                <div className="space-y-6">
                                    <div className="flex items-start justify-between gap-4 flex-wrap">
                                        <div>
                                            <h2 className="text-base font-semibold mb-1"
                                                style={{ color: 'var(--text-primary)' }}>Data management</h2>
                                            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                                Import, switch, export, or remove your position sets.
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => setImportModalOpen(true)}
                                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex-shrink-0"
                                            style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-glow)' }}
                                        >
                                            <MdUpload size={15} />
                                            Import set
                                        </button>
                                    </div>
                                    <PositionSetManager
                                        hideHeader
                                        onPositionSetChanged={handlePositionSetChanged}
                                        refreshTrigger={demoBannerRefresh}
                                    />
                                </div>
                            )}
                        </div>
                    </main>
                </div>
            </div>

            {/* ── Mobile bottom tab bar ────────────────────────────── */}
            <nav
                className="md:hidden fixed bottom-0 inset-x-0 z-30 flex"
                style={{
                    background: 'var(--surface-sidebar)',
                    borderTop: '1px solid var(--border)',
                    paddingBottom: 'env(safe-area-inset-bottom)',
                }}
            >
                {NAV_ITEMS.map(item => {
                    const isActive = activeView === item.id;
                    const Icon = item.icon;
                    return (
                        <button
                            key={item.id}
                            onClick={() => setActiveView(item.id as ViewId)}
                            className="flex-1 flex flex-col items-center gap-1 py-2 text-xs font-medium transition-colors"
                            style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)' }}
                        >
                            <Icon size={20} />
                            <span>{item.label}</span>
                        </button>
                    );
                })}
                <button
                    onClick={() => window.location.href = '/returns/deep-dive'}
                    className="flex-1 flex flex-col items-center gap-1 py-2 text-xs font-medium transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                >
                    <MdTrendingUp size={20} />
                    <span>XIRR</span>
                </button>
            </nav>

            {/* ── Undo toast ───────────────────────────────────────── */}
            {undoEntry && (
                <div
                    className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl"
                    style={{ background: 'var(--surface-popover)', border: '1px solid var(--border-strong)' }}
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
                            setDemoBannerRefresh(prev => prev + 1);
                            setActionInfo(`Imported ${count} transactions — activate the new set below to view it.`);
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
                    onSaved={() => { setAddPositionOpen(false); handlePositionSetChanged(); }}
                    onClose={() => setAddPositionOpen(false)}
                />
            )}

            {/* ── Sell position modal ──────────────────────────── */}
            {sellTarget && (
                <SellPositionModal
                    setId={sellTarget.setId}
                    position={sellTarget.position}
                    onSaved={() => { setSellTarget(null); handlePositionSetChanged(); }}
                    onClose={() => setSellTarget(null)}
                />
            )}

            {/* ── Action error toast ───────────────────────────── */}
            {actionError && (
                <div
                    className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl max-w-md"
                    style={{ background: 'var(--surface-popover)', border: '1px solid var(--pnl-red)' }}
                >
                    <span className="text-sm" style={{ color: 'var(--pnl-red)' }}>{actionError}</span>
                    <button
                        onClick={() => setActionError(null)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                        style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {/* ── Action info toast ────────────────────────────── */}
            {actionInfo && (
                <div
                    className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl max-w-md"
                    style={{ background: 'var(--surface-popover)', border: '1px solid var(--accent-glow)' }}
                >
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{actionInfo}</span>
                    <button
                        onClick={() => setActionInfo(null)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                        style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                    >
                        Dismiss
                    </button>
                </div>
            )}

            <WelcomeModal onOpenSettings={() => setSettingsOpen(true)} />

            <SettingsPanel
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                currency={currency}
                onCurrencyChange={handleCurrencyChange}
            />
        </>
    );
}
