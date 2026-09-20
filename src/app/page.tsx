'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { loadPositions } from '../utils/positions';
import { calculatePortfolioSummary, taxLotKey } from '@portfolio/core';
import { readCachedSummary, writeCachedSummary, clearChartCache } from '../utils/pnlCache';
import { PortfolioSummary as PortfolioSummaryType, Position, Transaction } from '@portfolio/types';
import { PortfolioSummary } from '../components/layout/PortfolioSummary';
import { PerformanceChart } from '../components/charts/PerformanceChart';
import { AnalyticsPanel } from '../components/overview/AnalyticsPanel';
import { BenchmarkCard } from '../components/overview/BenchmarkCard';
import { PortfolioHealthCard } from '../components/overview/PortfolioHealthCard';
import { AssetClassFilter } from '../components/overview/AssetClassFilter';
import { PositionsTable } from '../components/tables/PositionsTable';
import DemoBanner from '../components/layout/DemoBanner';
import WelcomeModal from '../components/layout/WelcomeModal';
import { SettingsPanel } from '../components/layout/SettingsPanel';
import { AppSidebar } from '../components/layout/AppSidebar';
import { useBaseCurrency } from '../hooks/useBaseCurrency';
import { useAccountTaxSettings } from '../hooks/useAccountTaxSettings';
import { useTaxResidence } from '../hooks/useTaxResidence';
import { useTaxFeatureEnabled } from '../hooks/useTaxFeatureEnabled';
import { usePortfolioSummaryData } from '../hooks/usePortfolioSummaryData';
import { useAssetClasses } from '../hooks/useAssetClasses';
import { useActiveSetName } from '../hooks/useActiveSetName';
import { deriveSummaryForClasses, presentAssetClasses } from '../utils/assetClassFilter';
import { buildSnapshot, formatSnapshotMarkdown } from '../utils/portfolioSnapshot';
import { copyToClipboard } from '../utils/clipboard';
import { publishSnapshot } from '../utils/publishSnapshot';
import {
    MdCloudOff, MdRefresh, MdSettings, MdAdd, MdUndo, MdUpload,
    MdVisibility, MdVisibilityOff, MdAccountBalanceWallet, MdAutoAwesome,
} from 'react-icons/md';
import { MobileBottomNav } from '../components/layout/MobileBottomNav';
import { useTranslation } from '../i18n';
import type { TranslationKey, TranslationParams } from '../i18n';

import ImportSetModal from '../components/management/ImportSetModal';
import AddPositionModal from '../components/management/AddPositionModal';
import SellPositionModal from '../components/management/SellPositionModal';
import PositionSetManager from '../components/management/PositionSetManager';
import { ClosedPositionsTable } from '../components/tables/ClosedPositionsTable';
import { getActiveSetId, exportSetTransactions, removeTransactionFromSet, insertTransactionIntoSet } from '../utils/localPositions';

import type { SidebarViewId } from '../components/layout/AppSidebar';
type ViewId = SidebarViewId;
type AssetsTab = 'open' | 'closed';

interface UndoEntry {
    position: Position;
    transaction: Transaction;
    index: number;
    setId: string;
}

/**
 * A user-facing message held as a key plus params, so it re-renders in the
 * active language. `detail` carries text that came from outside the app
 * (a fetch/Error message) and is shown verbatim rather than mistranslated.
 */
interface Notice {
    key: TranslationKey;
    params?: TranslationParams;
    detail?: string;
}

export default function Home() {
    const { t, locale } = useTranslation();
    const [portfolioSummary, setPortfolioSummary] = useState<PortfolioSummaryType | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Notice | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [importModalOpen, setImportModalOpen] = useState(false);
    const [addPositionOpen, setAddPositionOpen] = useState(false);
    const [sellTarget, setSellTarget] = useState<{ position: Position; setId: string } | null>(null);
    const [actionError, setActionError] = useState<Notice | null>(null);
    const [actionInfo, setActionInfo] = useState<Notice | null>(null);
    const [demoBannerRefresh, setDemoBannerRefresh] = useState(0);
    const [undoEntry, setUndoEntry] = useState<UndoEntry | null>(null);
    const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [showValues, setShowValues] = useState(true);
    const [activeView, setActiveView] = useState<ViewId>('overview');
    const [assetsTab, setAssetsTab] = useState<AssetsTab>('open');
    // Overview asset-class filter. null = all classes; otherwise an explicit subset.
    const [selectedClasses, setSelectedClasses] = useState<string[] | null>(null);

    useEffect(() => {
        const saved = localStorage.getItem('showValues');
        if (saved !== null) setShowValues(JSON.parse(saved));
        const savedClasses = localStorage.getItem('overviewAssetClasses');
        if (savedClasses !== null) setSelectedClasses(JSON.parse(savedClasses));
    }, []);

    useEffect(() => {
        localStorage.setItem('overviewAssetClasses', JSON.stringify(selectedClasses));
    }, [selectedClasses]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const v = params.get('view');
        // Current ids, plus backward-compat for the old holdings/closed/transactions links.
        if (v === 'overview' || v === 'assets' || v === 'data') {
            setActiveView(v);
        } else if (v === 'holdings') {
            setActiveView('assets');
        } else if (v === 'closed') {
            setActiveView('assets');
            setAssetsTab('closed');
        } else if (v === 'transactions') {
            setActiveView('data');
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
    const { settings: accountTaxSettings } = useAccountTaxSettings();
    const { residenceCountry: taxResidenceCountry } = useTaxResidence();
    const { enabled: taxFeatureEnabled, setEnabled: setTaxFeatureEnabled } = useTaxFeatureEnabled();
    const activeSetName = useActiveSetName(demoBannerRefresh);

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
            setError({
                key: 'home.errLoadPortfolio',
                detail: err instanceof Error ? err.message : undefined,
            });
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
            setError({
                key: 'home.errRefresh',
                detail: err instanceof Error ? err.message : undefined,
            });
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
            setActionError({ key: 'home.errDeleteClosed' });
            return;
        }
        if (position.txBuyIndex === undefined) return;

        const setId = getActiveSetId();
        const txs = exportSetTransactions(setId);
        const buyTx = txs[position.txBuyIndex];
        if (!buyTx || buyTx.way !== 'buy') return;

        if (position.quantity < buyTx.quantity) {
            setActionError({
                key: 'home.errDeletePartiallySold',
                params: { sold: buyTx.quantity - position.quantity, total: buyTx.quantity },
            });
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

    // ── Tax estimate: force the gain into real JPY ──────────────────────────
    // Japan (the taxpayer's reporting currency per the tax model) computes a
    // gain from the historical JPY rate at acquisition vs. today's/the sale's
    // JPY rate — a different number from converting the display-currency gain
    // at today's rate. So when the display base currency isn't JPY, load a
    // parallel JPY summary purely for the tax column (shares the same cache
    // the dashboard itself uses when the display currency already is JPY).
    // Gated on the tax feature actually being configured, since this doubles
    // network fetches otherwise.
    const taxFeatureActive = taxFeatureEnabled && taxResidenceCountry !== null
        && Object.values(accountTaxSettings).some(s => s.wrapper !== 'NONE');
    const { summary: taxJpySummary } = usePortfolioSummaryData('JPY', taxFeatureActive);

    const taxGainJpyByKey = useMemo(() => {
        const map = new Map<string, number>();
        if (!taxJpySummary) return map;
        for (const p of taxJpySummary.positions) map.set(taxLotKey(p), p.pnlJPY);
        for (const p of taxJpySummary.closedPositions) map.set(taxLotKey(p), p.realizedPnlJPY ?? 0);
        return map;
    }, [taxJpySummary]);

    // ── Overview asset-class filter ───────────────────────────────────────
    // Resolve the asset class for every ticker we hold (open + closed), then
    // scope the whole overview — KPIs, chart, analytics, benchmark — to the
    // selected classes. Other views (holdings/closed/manage) stay unfiltered.
    const allTickers = useMemo(
        () => [...summary.positions, ...summary.closedPositions].map(p => p.ticker),
        [summary.positions, summary.closedPositions],
    );
    const { assetClasses } = useAssetClasses(allTickers);

    const presentClasses = useMemo(
        () => presentAssetClasses(summary, assetClasses),
        [summary, assetClasses],
    );

    // Reconcile the persisted selection against what's actually held: drop
    // stale classes, and collapse "empty" or "everything" back to null (= all).
    const effectiveSelected = useMemo<Set<string> | null>(() => {
        if (selectedClasses === null) return null;
        const set = new Set(selectedClasses.filter(c => presentClasses.includes(c)));
        if (set.size === 0 || set.size === presentClasses.length) return null;
        return set;
    }, [selectedClasses, presentClasses]);

    const overviewSummary = useMemo(
        () => deriveSummaryForClasses(summary, assetClasses, effectiveSelected),
        [summary, assetClasses, effectiveSelected],
    );

    // ── AI brief ──────────────────────────────────────────────────────────
    // The portfolio only exists in this browser, so an assistant can't reach it
    // on its own — the numbers have to be carried across by hand. This puts a
    // compact markdown brief on the clipboard, ready to paste into any chat.
    // Deliberately built from the unfiltered `summary`: the overview's
    // asset-class filter is a viewing aid, not a statement about what is held.
    const makeBrief = useCallback(() => {
        const snapshot = buildSnapshot(summary, currency, {
            assetClasses,
            portfolioName: activeSetName || 'Portfolio',
        });
        return { snapshot, markdown: formatSnapshotMarkdown(snapshot) };
    }, [summary, currency, assetClasses, activeSetName]);

    const handleCopyBrief = useCallback(async () => {
        if (await copyToClipboard(makeBrief().markdown)) {
            setActionInfo({ key: 'home.copyBriefCopied' });
            setTimeout(() => setActionInfo(null), 5000);
        } else {
            setActionError({ key: 'home.errCopyBrief' });
        }
    }, [makeBrief]);

    // Keep the local snapshot bridge in step with what's on screen, so an MCP
    // server reading the file reports the same numbers the portal shows rather
    // than whatever was true the last time someone pressed a button. No-ops
    // unless the page is served from localhost — see `publishSnapshot`.
    // Resolved in an effect, not during render: getActiveSetId reads
    // localStorage, which doesn't exist while Next prerenders this page.
    const [activeSetId, setActiveSetId] = useState<string | null>(null);
    useEffect(() => {
        setActiveSetId(getActiveSetId());
    }, [demoBannerRefresh]);

    const lastPublished = useRef<string | null>(null);
    useEffect(() => {
        if (summary.positions.length === 0) return;
        // A page load publishes several times over a second or two as cached
        // prices give way to live ones and asset classes resolve. Only the
        // settled version is worth writing, so let the burst finish first.
        const timer = setTimeout(() => {
            const { snapshot, markdown } = makeBrief();
            // The brief is dated to the day, so it only differs when data does.
            if (markdown === lastPublished.current) return;
            lastPublished.current = markdown;
            void publishSnapshot(snapshot, markdown);
        }, 1500);
        return () => clearTimeout(timer);
    }, [summary.positions.length, makeBrief]);

    return (
        <>
            <div className="flex h-dvh overflow-hidden" style={{ background: 'var(--bg-base)' }}>

                <AppSidebar
                    activePage="home"
                    activeView={activeView}
                    onViewChange={setActiveView}
                    onSettingsClick={() => setSettingsOpen(true)}
                    currency={currency}
                    activeSetName={activeSetName}
                    taxFeatureEnabled={taxFeatureEnabled}
                />

                {/* ── Content column ───────────────────────────────── */}
                <div className="flex-1 min-w-0 md:ml-[200px] flex flex-col h-dvh overflow-hidden">

                    {/* ── Main content ─────────────────────────────── */}
                    <main className="flex-1 min-h-0 pb-20 md:pb-0 overflow-hidden flex flex-col">
                        <div className="w-full max-w-screen-xl mx-auto px-3 sm:px-6 py-4 sm:py-6 flex-1 min-h-0 flex flex-col gap-4 sm:gap-6">

                            {/* Portfolio controls — portfolio name shown only on mobile (sidebar has it on desktop) */}
                            <div className="flex items-center gap-3 flex-shrink-0">
                                <div className="md:hidden flex items-center gap-2 min-w-0">
                                    <MdAccountBalanceWallet size={18} className="flex-shrink-0"
                                        style={{ color: 'var(--accent)' }} />
                                    <span className="text-sm font-semibold truncate" title={activeSetName}
                                        style={{ color: 'var(--text-primary)' }}>
                                        {activeSetName || t('sidebar.activePortfolio')}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 ml-auto flex-shrink-0">
                                    <span className="md:hidden px-2 py-0.5 rounded text-xs font-mono font-semibold"
                                        style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                                        {currency}
                                    </span>
                                    <button
                                        onClick={() => setSettingsOpen(o => !o)}
                                        className="md:hidden h-9 w-9 flex items-center justify-center rounded-lg"
                                        style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                                        aria-label={t(settingsOpen ? 'settings.close' : 'settings.open')}
                                    >
                                        <MdSettings size={18} />
                                    </button>
                                    {hasStalePrice && (
                                        <div className="relative group">
                                            <button className="h-9 w-9 flex items-center justify-center rounded-lg"
                                                style={{ color: 'var(--pnl-red)' }}
                                                aria-label={t('home.pricesUnavailable')}>
                                                <MdCloudOff size={18} />
                                            </button>
                                            <div className="absolute right-0 top-full mt-2 w-56 rounded-xl px-4 py-3 text-xs pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50"
                                                style={{ color: 'var(--text-secondary)', background: 'var(--surface-popover)', border: '1px solid var(--border)' }}>
                                                {t('home.pricesUnavailableDetail')}
                                            </div>
                                        </div>
                                    )}
                                    <button
                                        onClick={() => setShowValues(!showValues)}
                                        className="h-9 flex items-center gap-1.5 px-3 rounded-lg text-sm font-medium transition-all"
                                        style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                                        aria-label={showValues ? t('home.hideValues') : t('home.showValues')}
                                    >
                                        {showValues ? <MdVisibilityOff size={16} /> : <MdVisibility size={16} />}
                                        <span className="hidden sm:inline">{showValues ? t('common.hide') : t('common.show')}</span>
                                    </button>
                                    <button
                                        onClick={handleCopyBrief}
                                        disabled={summary.positions.length === 0}
                                        className="h-9 flex items-center gap-1.5 px-3 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                                        style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                                        title={t('home.copyBriefHint')}
                                        aria-label={t('home.copyBrief')}
                                    >
                                        <MdAutoAwesome size={16} />
                                        <span className="hidden sm:inline">{t('home.copyBrief')}</span>
                                    </button>
                                    <button
                                        onClick={handleRefreshClick}
                                        disabled={refreshing}
                                        className="h-9 flex items-center gap-1.5 px-3 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                                        style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-glow)' }}
                                    >
                                        <MdRefresh size={16} className={refreshing ? 'animate-spin' : ''} />
                                        <span className="hidden sm:inline">{refreshing ? t('home.refreshing') : t('home.refresh')}</span>
                                    </button>
                                </div>
                            </div>

                            <div className="flex-shrink-0"><DemoBanner refreshTrigger={demoBannerRefresh} /></div>

                            {/* Loading state (overview renders chrome immediately; other views show spinner) */}
                            {loading && activeView !== 'overview' && (
                                <div className="flex-1 min-h-0 flex items-center justify-center">
                                    <div className="text-center space-y-4">
                                        <div className="w-8 h-8 rounded-full border-2 border-t-transparent mx-auto animate-spin"
                                            style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
                                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('home.loadingPortfolio')}</p>
                                    </div>
                                </div>
                            )}

                            {/* Error state */}
                            {!loading && error && (
                                <div className="flex-1 min-h-0 flex items-center justify-center px-8">
                                    <div className="rounded-xl p-8 max-w-md text-center space-y-3"
                                        style={{ background: 'var(--surface)', border: '1px solid var(--pnl-red)' }}>
                                        <p className="font-semibold" style={{ color: 'var(--pnl-red)' }}>{t('common.error')}</p>
                                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                            {t(error.key, error.params)}{error.detail ? ` (${error.detail})` : ''}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Overview: KPIs render immediately with placeholder; chart waits for data */}
                            {activeView === 'overview' && (
                                <div className="flex-1 min-h-0 scroll-elastic-y">
                                <div className="space-y-4 sm:space-y-6">
                                    {!loading && portfolioSummary && (
                                        <AssetClassFilter
                                            present={presentClasses}
                                            selected={selectedClasses}
                                            onChange={setSelectedClasses}
                                        />
                                    )}
                                    <PortfolioSummary
                                        summary={overviewSummary}
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
                                                        positions={overviewSummary.positions}
                                                        showValues={showValues}
                                                        currency={currency}
                                                        symbol={symbol}
                                                    />
                                                </div>
                                                <div className="lg:col-span-2 min-w-0">
                                                    <AnalyticsPanel
                                                        summary={overviewSummary}
                                                        symbol={symbol}
                                                        formatValue={formatValue}
                                                        showValues={showValues}
                                                    />
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <BenchmarkCard summary={overviewSummary} baseCurrency={currency} />
                                                <PortfolioHealthCard
                                                    positions={overviewSummary.positions}
                                                    totalValueJPY={overviewSummary.totalValueJPY}
                                                />
                                            </div>
                                        </>
                                    )}
                                </div>
                                </div>
                            )}

                            {/* Assets: open + closed positions in one place, toggled */}
                            {!loading && portfolioSummary && activeView === 'assets' && (
                                <div className="flex-1 min-h-0 flex flex-col gap-3">
                                    {/* Title row */}
                                    <div className="flex items-center gap-3 flex-shrink-0">
                                        <h1 className="text-sm font-semibold flex-shrink-0" style={{ color: 'var(--text-primary)' }}>
                                            {t('nav.assets')}
                                        </h1>
                                        <span className="text-xs truncate hidden sm:inline" style={{ color: 'var(--text-muted)' }}>
                                            {t('home.assetsSubtitle', {
                                                count: (portfolioSummary.positions.length + portfolioSummary.closedPositions.length).toLocaleString(locale),
                                            })}
                                        </span>
                                    </div>
                                    {/* Open / Closed strip */}
                                    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                                        <div className="inline-flex rounded-lg p-0.5 text-sm font-medium"
                                            style={{ background: 'var(--glass-bg)', border: '1px solid var(--border)' }}>
                                            {([
                                                { id: 'open' as const,   labelKey: 'home.tabOpen' as TranslationKey,   count: portfolioSummary.positions.length },
                                                { id: 'closed' as const, labelKey: 'home.tabClosed' as TranslationKey, count: portfolioSummary.closedPositions.length },
                                            ]).map(tab => (
                                                <button
                                                    key={tab.id}
                                                    onClick={() => setAssetsTab(tab.id)}
                                                    className="px-3 py-1.5 rounded-md transition-all"
                                                    style={assetsTab === tab.id
                                                        ? { background: 'var(--accent-dim)', color: 'var(--accent)' }
                                                        : { color: 'var(--text-secondary)' }}
                                                >
                                                    {t(tab.labelKey)} <span style={{ opacity: 0.6 }}>({tab.count})</span>
                                                </button>
                                            ))}
                                        </div>
                                        {assetsTab === 'open' && (
                                            <div className="ml-auto">
                                                <button
                                                    onClick={() => setAddPositionOpen(true)}
                                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                                                    style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-glow)' }}
                                                >
                                                    <MdAdd size={15} />
                                                    {t('addPosition.title')}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    {/* PositionsTable scrolls internally (its own fixed-height, sticky-header
                                        grid) — this wrapper must stay non-scrolling for that tab, or the two
                                        nested scrollers fight over the same vertical gesture. ClosedPositionsTable
                                        has no scroll of its own (it grows to its natural height), so it needs
                                        this wrapper to be the one that scrolls. */}
                                    <div className={assetsTab === 'open' ? 'flex-1 min-h-0 overflow-hidden' : 'flex-1 min-h-0 scroll-elastic-y'}>
                                        {assetsTab === 'open' ? (
                                            <PositionsTable
                                                positions={portfolioSummary.positions}
                                                showValues={showValues}
                                                baseCurrency={currency}
                                                onDeletePosition={handleDeletePosition}
                                                onSellPosition={handleSellPosition}
                                                taxFeatureEnabled={taxFeatureEnabled}
                                                taxResidenceCountry={taxResidenceCountry}
                                                accountTaxSettings={accountTaxSettings}
                                                taxGainJpyByKey={taxGainJpyByKey}
                                            />
                                        ) : (
                                            <ClosedPositionsTable
                                                positions={portfolioSummary.closedPositions}
                                                showValues={showValues}
                                                baseCurrency={currency}
                                                realizedPnlJPY={portfolioSummary.realizedPnlJPY}
                                                realizedCostJPY={portfolioSummary.realizedCostJPY}
                                                realizedPnlPercentage={portfolioSummary.realizedPnlPercentage}
                                            />
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Data: portfolio management */}
                            {!loading && portfolioSummary && activeView === 'data' && (
                                <div className="flex-1 min-h-0 scroll-elastic-y">
                                <div className="space-y-4">
                                    <div className="flex items-start justify-between gap-4 flex-wrap">
                                        <div>
                                            <h2 className="text-base font-semibold mb-1"
                                                style={{ color: 'var(--text-primary)' }}>{t('home.yourPortfolios')}</h2>
                                            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                                {t('home.yourPortfoliosHelp')}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => setImportModalOpen(true)}
                                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex-shrink-0"
                                            style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-glow)' }}
                                        >
                                            <MdUpload size={15} />
                                            {t('home.loadFromFile')}
                                        </button>
                                    </div>
                                    <PositionSetManager
                                        onPositionSetChanged={handlePositionSetChanged}
                                        refreshTrigger={demoBannerRefresh}
                                    />
                                </div>
                                </div>
                            )}
                        </div>
                    </main>
                </div>
            </div>

            <MobileBottomNav
                activePage="home"
                activeView={activeView}
                onViewChange={(v) => { setSettingsOpen(false); setActiveView(v); }}
                settingsOpen={settingsOpen}
                onSettingsToggle={() => setSettingsOpen(o => !o)}
            />

            {/* ── Undo toast ───────────────────────────────────────── */}
            {undoEntry && (
                <div
                    className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl"
                    style={{ background: 'var(--surface-popover)', border: '1px solid var(--border-strong)' }}
                >
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        <span style={{ color: 'var(--text-primary)' }}>{String(undoEntry.position.ticker)}</span>
                        {' '}{t('home.removed')}
                    </span>
                    <button
                        onClick={handleUndo}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                        style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-glow)' }}
                    >
                        <MdUndo size={15} />
                        {t('home.undo')}
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
                            setActionInfo({ key: 'home.infoLoadedTransactions', params: { count } });
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
                    <span className="text-sm" style={{ color: 'var(--pnl-red)' }}>{t(actionError.key, actionError.params)}</span>
                    <button
                        onClick={() => setActionError(null)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                        style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                    >
                        {t('welcome.dismiss')}
                    </button>
                </div>
            )}

            {/* ── Action info toast ────────────────────────────── */}
            {actionInfo && (
                <div
                    className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl max-w-md"
                    style={{ background: 'var(--surface-popover)', border: '1px solid var(--accent-glow)' }}
                >
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t(actionInfo.key, actionInfo.params)}</span>
                    <button
                        onClick={() => setActionInfo(null)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                        style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                    >
                        {t('welcome.dismiss')}
                    </button>
                </div>
            )}

            <WelcomeModal
                onAddPosition={() => setAddPositionOpen(true)}
                onImport={() => setImportModalOpen(true)}
            />

            <SettingsPanel
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                currency={currency}
                onCurrencyChange={handleCurrencyChange}
                activeSetId={activeSetId}
                buildBrief={makeBrief}
                hasPositions={summary.positions.length > 0}
                taxFeatureEnabled={taxFeatureEnabled}
                onTaxFeatureEnabledChange={setTaxFeatureEnabled}
            />
        </>
    );
}
