'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppSidebar } from '../../components/layout/AppSidebar';
import { SettingsPanel } from '../../components/layout/SettingsPanel';
import { ScreenerTable } from '../../components/screener/ScreenerTable';
import { AddMenu } from '../../components/screener/AddMenu';
import { AlertModal } from '../../components/screener/AlertModal';
import { StockChartModal } from '../../components/screener/StockChartModal';
import { useBaseCurrency } from '../../hooks/useBaseCurrency';
import { useActiveSetName } from '../../hooks/useActiveSetName';
import { MobileBottomNav } from '../../components/layout/MobileBottomNav';
import topix from '../../data/indices/topix.json';
import type { IndexConstituent, IndexConstituentsFile, PriceAlert } from '../../types/screener';

// Registry of bundled index lists. Add nikkei225/sp500 here as their static
// files land (see scripts/fetch-constituents.mjs).
const INDICES: Record<string, IndexConstituentsFile> = {
    topix: topix as IndexConstituentsFile,
};

const STORAGE_KEY = 'screener:state';

interface ScreenerState {
    index: string;
    added: IndexConstituent[];
    pinned: string[];
    alerts: Record<string, PriceAlert>;
}

type View = 'all' | 'pinned';

export default function ScreenerPage() {
    const { currency, setCurrency } = useBaseCurrency();
    const activeSetName = useActiveSetName();

    const [settingsOpen, setSettingsOpen] = useState(false);
    const [indexKey, setIndexKey] = useState('topix');
    const [added, setAdded] = useState<IndexConstituent[]>([]);
    const [pinned, setPinned] = useState<string[]>([]);
    const [alerts, setAlerts] = useState<Record<string, PriceAlert>>({});
    const [view, setView] = useState<View>('all');
    const [loaded, setLoaded] = useState(false);

    // Modals
    const [alertTarget, setAlertTarget] = useState<IndexConstituent | null>(null);
    const [chartTarget, setChartTarget] = useState<IndexConstituent | null>(null);
    const [chartCurrency, setChartCurrency] = useState<string | null>(null);

    // Load persisted state once.
    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw) as Partial<ScreenerState>;
                if (parsed.index && INDICES[parsed.index]) setIndexKey(parsed.index);
                if (Array.isArray(parsed.added)) setAdded(parsed.added);
                if (Array.isArray(parsed.pinned)) setPinned(parsed.pinned);
                if (parsed.alerts && typeof parsed.alerts === 'object') setAlerts(parsed.alerts);
            }
        } catch { /* ignore corrupt state */ }
        setLoaded(true);
    }, []);

    // Persist on change (after initial load, so we don't clobber storage with defaults).
    useEffect(() => {
        if (!loaded) return;
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ index: indexKey, added, pinned, alerts }));
    }, [loaded, indexKey, added, pinned, alerts]);

    const file = INDICES[indexKey];
    const pinnedSet = useMemo(() => new Set(pinned), [pinned]);

    // Added tickers first, then the index — de-duped by symbol.
    const { allRows, addedSymbols } = useMemo(() => {
        const addedSet = new Set(added.map(a => a.symbol));
        const merged = [...added, ...file.constituents.filter(c => !addedSet.has(c.symbol))];
        return { allRows: merged, addedSymbols: addedSet };
    }, [added, file]);

    const rows = useMemo(
        () => (view === 'pinned' ? allRows.filter(r => pinnedSet.has(r.symbol)) : allRows),
        [view, allRows, pinnedSet],
    );

    const handleAdd = useCallback((c: IndexConstituent) => {
        setAdded(prev => (prev.some(p => p.symbol === c.symbol) ? prev : [c, ...prev]));
    }, []);
    const handleRemove = useCallback((symbol: string) => {
        setAdded(prev => prev.filter(p => p.symbol !== symbol));
    }, []);
    const handleTogglePin = useCallback((symbol: string) => {
        setPinned(prev => (prev.includes(symbol) ? prev.filter(s => s !== symbol) : [...prev, symbol]));
    }, []);
    const handleAddMany = useCallback((cs: IndexConstituent[]) => {
        setAdded(prev => {
            const have = new Set(prev.map(p => p.symbol));
            const fresh = cs.filter(c => !have.has(c.symbol));
            return fresh.length ? [...fresh, ...prev] : prev;
        });
    }, []);
    const handleEditAlert = useCallback((c: IndexConstituent) => setAlertTarget(c), []);
    const handleOpenChart = useCallback((c: IndexConstituent, currency: string | null) => {
        setChartTarget(c);
        setChartCurrency(currency);
    }, []);

    const saveAlert = (alert: PriceAlert) => {
        if (!alertTarget) return;
        setAlerts(prev => ({ ...prev, [alertTarget.symbol]: alert }));
        setAlertTarget(null);
    };
    const clearAlert = () => {
        if (!alertTarget) return;
        setAlerts(prev => { const next = { ...prev }; delete next[alertTarget.symbol]; return next; });
        setAlertTarget(null);
    };

    const tabBtn = (id: View, label: string, count: number) => (
        <button
            key={id}
            onClick={() => setView(id)}
            className="px-3 py-1.5 rounded-md transition-all"
            style={view === id ? { background: 'var(--accent-dim)', color: 'var(--accent)' } : { color: 'var(--text-secondary)' }}
        >
            {label} <span style={{ opacity: 0.6 }}>({count})</span>
        </button>
    );

    return (
        <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-base)' }}>
            <AppSidebar activePage="screener" currency={currency} activeSetName={activeSetName} />

            <div className="flex-1 min-w-0 md:ml-[200px] flex flex-col h-screen overflow-hidden">
                {/* Header */}
                <header
                    className="sticky top-0 z-10 px-4 sm:px-6 h-[52px] flex items-center"
                    style={{ background: 'var(--surface-header)', borderBottom: '1px solid var(--border)' }}
                >
                    <h1 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                        Screener
                    </h1>
                </header>

                {/* Main */}
                <main className="flex-1 min-h-0 pb-20 md:pb-0">
                    <div className="max-w-screen-xl mx-auto px-3 sm:px-6 py-4 sm:py-6 h-full flex flex-col gap-4">
                        {/* One source control (Add ▾) + All/Pinned view + attribution */}
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-3">
                                <AddMenu
                                    indices={INDICES}
                                    currentIndexKey={indexKey}
                                    onLoadIndex={setIndexKey}
                                    onAddTicker={handleAdd}
                                    onAddMany={handleAddMany}
                                />
                                <div className="inline-flex rounded-lg p-0.5 text-sm font-medium"
                                    style={{ background: 'var(--glass-bg)', border: '1px solid var(--border)' }}>
                                    {tabBtn('all', 'All', allRows.length)}
                                    {tabBtn('pinned', 'Pinned', pinnedSet.size)}
                                </div>
                            </div>
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                {file.index} as of {file.asOf ?? '—'} · {file.source}
                            </p>
                        </div>

                        <div className="flex-1 min-h-0">
                            <ScreenerTable
                                constituents={rows}
                                onRemove={handleRemove}
                                removableSymbols={addedSymbols}
                                pinnedSymbols={pinnedSet}
                                onTogglePin={handleTogglePin}
                                alerts={alerts}
                                onEditAlert={handleEditAlert}
                                onOpenChart={handleOpenChart}
                            />
                        </div>
                    </div>
                </main>
            </div>

            {alertTarget && (
                <AlertModal
                    symbol={alertTarget.symbol}
                    name={alertTarget.name}
                    existing={alerts[alertTarget.symbol] ?? null}
                    onSave={saveAlert}
                    onClear={clearAlert}
                    onClose={() => setAlertTarget(null)}
                />
            )}

            {chartTarget && (
                <StockChartModal
                    symbol={chartTarget.symbol}
                    name={chartTarget.name}
                    currency={chartCurrency}
                    onClose={() => setChartTarget(null)}
                />
            )}

            <SettingsPanel
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                currency={currency}
                onCurrencyChange={setCurrency}
            />

            <MobileBottomNav
                activePage="screener"
                settingsOpen={settingsOpen}
                onSettingsToggle={() => setSettingsOpen(o => !o)}
            />
        </div>
    );
}
