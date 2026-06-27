'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MdClose, MdExpandMore } from 'react-icons/md';
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

const INDICES: Record<string, IndexConstituentsFile> = {
    topix: topix as IndexConstituentsFile,
};

const STORAGE_KEY = 'screener:state';

interface ScreenerState {
    index: string;
    indexLoaded: boolean;
    added: IndexConstituent[];
    pinned: string[];
    alerts: Record<string, PriceAlert>;
}

function OverflowPill({ added, onRemove }: { added: IndexConstituent[]; onRemove: (s: string) => void }) {
    const [open, setOpen] = useState(false);
    if (added.length === 0) return null;
    return (
        <div className="relative">
            <button
                onClick={() => setOpen(o => !o)}
                className="flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs transition-all hover:opacity-80"
                style={{ background: 'var(--glass-bg)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
            >
                +{added.length} more <MdExpandMore size={11} />
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div
                        className="absolute left-0 top-full mt-1 z-50 rounded-xl py-1 overflow-y-auto"
                        style={{
                            background: 'var(--surface-popover)',
                            border: '1px solid var(--border-strong)',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                            minWidth: 140,
                            maxHeight: 220,
                        }}
                    >
                        {added.map(c => (
                            <div key={c.symbol} className="flex items-center justify-between gap-3 px-3 py-1.5 hover:opacity-80">
                                <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{c.code}</span>
                                <button
                                    onClick={() => { onRemove(c.symbol); if (added.length === 1) setOpen(false); }}
                                    style={{ color: 'var(--text-muted)' }}
                                    title={`Remove ${c.code}`}
                                >
                                    <MdClose size={13} />
                                </button>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

export default function ScreenerPage() {
    const { currency, setCurrency } = useBaseCurrency();
    const activeSetName = useActiveSetName();

    const [settingsOpen, setSettingsOpen] = useState(false);
    const [indexKey, setIndexKey] = useState('topix');
    const [indexLoaded, setIndexLoaded] = useState(true);
    const [added, setAdded] = useState<IndexConstituent[]>([]);
    const [pinned, setPinned] = useState<string[]>([]);
    const [alerts, setAlerts] = useState<Record<string, PriceAlert>>({});
    const [loaded, setLoaded] = useState(false);

    const [alertTarget, setAlertTarget] = useState<IndexConstituent | null>(null);
    const [chartTarget, setChartTarget] = useState<IndexConstituent | null>(null);
    const [chartCurrency, setChartCurrency] = useState<string | null>(null);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw) as Partial<ScreenerState>;
                if (parsed.index && INDICES[parsed.index]) setIndexKey(parsed.index);
                if (typeof parsed.indexLoaded === 'boolean') setIndexLoaded(parsed.indexLoaded);
                if (Array.isArray(parsed.added)) setAdded(parsed.added);
                if (Array.isArray(parsed.pinned)) setPinned(parsed.pinned);
                if (parsed.alerts && typeof parsed.alerts === 'object') setAlerts(parsed.alerts);
            }
        } catch { /* ignore corrupt state */ }
        setLoaded(true);
    }, []);

    useEffect(() => {
        if (!loaded) return;
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ index: indexKey, indexLoaded, added, pinned, alerts }));
    }, [loaded, indexKey, indexLoaded, added, pinned, alerts]);

    const file = INDICES[indexKey];
    const pinnedSet = useMemo(() => new Set(pinned), [pinned]);

    const { allRows, addedSymbols } = useMemo(() => {
        const addedSet = new Set(added.map(a => a.symbol));
        const merged = indexLoaded
            ? [...added, ...file.constituents.filter(c => !addedSet.has(c.symbol))]
            : [...added];
        return { allRows: merged, addedSymbols: addedSet };
    }, [added, file, indexLoaded]);

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
    const handleOpenChart = useCallback((c: IndexConstituent, cur: string | null) => {
        setChartTarget(c);
        setChartCurrency(cur);
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

    const visibleAdded = added.slice(0, 2);
    const overflowAdded = added.slice(2);

    return (
        <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-base)' }}>
            <AppSidebar activePage="screener" currency={currency} activeSetName={activeSetName} />

            <div className="flex-1 min-w-0 md:ml-[200px] flex flex-col h-screen overflow-hidden">
                <div className="flex-1 min-h-0 pb-20 md:pb-0 overflow-hidden">
                    <div className="max-w-screen-xl mx-auto px-3 sm:px-5 pt-4 sm:pt-5 pb-4 h-full flex flex-col gap-3">

                        {/* Title row — no separate sticky header */}
                        <div className="flex items-center gap-3 flex-shrink-0">
                            <h1 className="text-sm font-semibold flex-shrink-0" style={{ color: 'var(--text-primary)' }}>
                                {file.index}
                            </h1>
                            {indexLoaded && (
                                <span className="text-xs truncate hidden sm:inline" style={{ color: 'var(--text-muted)' }}>
                                    Constituent names · {file.source}{file.asOf ? ` · list snapshot ${file.asOf}` : ''}
                                </span>
                            )}
                        </div>

                        {/* Universe strip */}
                        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                            <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>Universe:</span>
                            {indexLoaded && (
                                <span
                                    className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0"
                                    style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-glow)' }}
                                >
                                    {file.index} · {file.count.toLocaleString()}
                                    <button
                                        onClick={() => setIndexLoaded(false)}
                                        className="hover:opacity-70 leading-none"
                                        style={{ color: 'var(--accent)', opacity: 0.6 }}
                                        title={`Remove ${file.index} universe`}
                                    >
                                        <MdClose size={11} />
                                    </button>
                                </span>
                            )}
                            {visibleAdded.map(c => (
                                <span
                                    key={c.symbol}
                                    className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs flex-shrink-0"
                                    style={{ background: 'var(--glass-bg)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                                >
                                    {c.code}
                                    <button
                                        onClick={() => handleRemove(c.symbol)}
                                        className="hover:opacity-70 leading-none"
                                        style={{ color: 'var(--text-muted)' }}
                                        title={`Remove ${c.code}`}
                                    >
                                        <MdClose size={11} />
                                    </button>
                                </span>
                            ))}
                            {overflowAdded.length > 0 && (
                                <OverflowPill added={overflowAdded} onRemove={handleRemove} />
                            )}
                            <div className="ml-auto">
                                <AddMenu
                                    indices={INDICES}
                                    currentIndexKey={indexLoaded ? indexKey : null}
                                    onLoadIndex={key => { setIndexKey(key); setIndexLoaded(true); }}
                                    onAddTicker={handleAdd}
                                    onAddMany={handleAddMany}
                                />
                            </div>
                        </div>

                        {/* Table — fills remaining height */}
                        <div className="flex-1 min-h-0">
                            <ScreenerTable
                                constituents={allRows}
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
                </div>
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
