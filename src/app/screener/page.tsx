'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MdClose, MdExpandMore, MdStar, MdChevronRight } from 'react-icons/md';
import { AppSidebar } from '../../components/layout/AppSidebar';
import { SettingsPanel } from '../../components/layout/SettingsPanel';
import { ScreenerTable } from '../../components/screener/ScreenerTable';
import { AddMenu } from '../../components/screener/AddMenu';
import { AlertModal } from '../../components/screener/AlertModal';
import { NoteModal } from '../../components/screener/NoteModal';
import { StockChartModal } from '../../components/screener/StockChartModal';
import { useBaseCurrency } from '../../hooks/useBaseCurrency';
import { useActiveSetName } from '../../hooks/useActiveSetName';
import { useAlertPoller } from '../../hooks/useAlertPoller';
import { useTaxFeatureEnabled } from '../../hooks/useTaxFeatureEnabled';
import { MobileBottomNav } from '../../components/layout/MobileBottomNav';
import AddPositionModal from '../../components/management/AddPositionModal';
import { getActiveSetId } from '../../utils/localPositions';
import { INDICES } from '../../data/indices/registry';
import { useScreenerState } from '../../hooks/useScreenerState';
import type { IndexConstituent, PriceAlert } from '../../types/screener';
import { useTranslation } from '../../i18n';

function OverflowPill({ added, onRemove }: { added: IndexConstituent[]; onRemove: (s: string) => void }) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    if (added.length === 0) return null;
    return (
        <div className="relative">
            <button
                onClick={() => setOpen(o => !o)}
                className="flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs transition-all hover:opacity-80"
                style={{ background: 'var(--glass-bg)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
            >
                {t('screenerPage.overflowMore', { count: added.length })} <MdExpandMore size={11} />
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
                                    title={t('screenerPage.removeTicker', { ticker: c.code })}
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
    const { t, locale } = useTranslation();
    const { currency, setCurrency } = useBaseCurrency();
    const activeSetName = useActiveSetName();
    const { enabled: taxFeatureEnabled, setEnabled: setTaxFeatureEnabled } = useTaxFeatureEnabled();

    const [settingsOpen, setSettingsOpen] = useState(false);
    const router = useRouter();
    const screener = useScreenerState();
    const { indexLoaded, added, pinned, alerts, notes } = screener;
    const indexKey = INDICES[screener.index] ? screener.index : 'topix';

    const [alertTarget, setAlertTarget] = useState<IndexConstituent | null>(null);
    const [noteTarget, setNoteTarget] = useState<IndexConstituent | null>(null);
    const [chartTarget, setChartTarget] = useState<IndexConstituent | null>(null);
    const [chartCurrency, setChartCurrency] = useState<string | null>(null);
    const [buyTarget, setBuyTarget] = useState<IndexConstituent | null>(null);

    const file = INDICES[indexKey];
    const pinnedSet = useMemo(() => new Set(pinned), [pinned]);

    const { allRows, addedSymbols } = useMemo(() => {
        const addedSet = new Set(added.map(a => a.symbol));
        const merged = indexLoaded
            ? [...added, ...file.constituents.filter(c => !addedSet.has(c.symbol))]
            : [...added];
        return { allRows: merged, addedSymbols: addedSet };
    }, [added, file, indexLoaded]);

    const handleAdd = screener.addTicker;
    const handleRemove = screener.removeTicker;
    const handleTogglePin = screener.togglePin;
    const handleAddMany = screener.addMany;
    useAlertPoller(alerts);

    const handleEditAlert = useCallback((c: IndexConstituent) => setAlertTarget(c), []);
    const handleEditNote = useCallback((c: IndexConstituent) => setNoteTarget(c), []);
    const handleBuy = useCallback((c: IndexConstituent) => setBuyTarget(c), []);
    const handleOpenChart = useCallback((c: IndexConstituent, cur: string | null) => {
        setChartTarget(c);
        setChartCurrency(cur);
    }, []);

    const saveAlert = (alert: PriceAlert) => {
        if (!alertTarget) return;
        screener.setAlert(alertTarget.symbol, alert);
        setAlertTarget(null);
        if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
            void Notification.requestPermission();
        }
    };
    const clearAlert = () => {
        if (!alertTarget) return;
        screener.setAlert(alertTarget.symbol, null);
        setAlertTarget(null);
    };

    const saveNote = (note: string) => {
        if (!noteTarget) return;
        screener.setNote(noteTarget.symbol, note);
        setNoteTarget(null);
    };
    const clearNote = () => {
        if (!noteTarget) return;
        screener.setNote(noteTarget.symbol, null);
        setNoteTarget(null);
    };

    const visibleAdded = added.slice(0, 2);
    const overflowAdded = added.slice(2);

    return (
        <div className="flex h-dvh overflow-hidden" style={{ background: 'var(--bg-base)' }}>
            <AppSidebar activePage="screener" currency={currency} activeSetName={activeSetName} taxFeatureEnabled={taxFeatureEnabled} />

            <div className="flex-1 min-w-0 md:ml-[200px] flex flex-col h-dvh overflow-hidden">
                <div className="flex-1 min-h-0 pb-20 md:pb-0 overflow-hidden">
                    <div className="max-w-screen-xl mx-auto px-3 sm:px-5 pt-4 sm:pt-5 pb-4 h-full flex flex-col gap-3">

                        {/* Title row — no separate sticky header */}
                        <div className="flex items-center gap-3 flex-shrink-0">
                            <h1 className="text-sm font-semibold flex-shrink-0" style={{ color: 'var(--text-primary)' }}>
                                {file.index}
                            </h1>
                            {indexLoaded && (
                                <span className="text-xs truncate hidden sm:inline" style={{ color: 'var(--text-muted)' }}>
                                    {t('screenerPage.constituentNames', { source: file.source })}
                                    {file.asOf ? ` · ${t('screenerPage.listSnapshot', { date: file.asOf })}` : ''}
                                </span>
                            )}
                            <button
                                onClick={() => router.push('/screener/pinned')}
                                className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium flex-shrink-0 transition-all hover:opacity-80"
                                style={{ color: 'var(--text-secondary)', background: 'var(--glass-bg)', border: '1px solid var(--border)' }}
                            >
                                <MdStar size={13} style={{ color: 'var(--accent)' }} />
                                {t('pinnedPage.open', { count: pinned.length })}
                                <MdChevronRight size={14} />
                            </button>
                        </div>

                        {/* Universe strip */}
                        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                            <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{t('screenerPage.universe')}:</span>
                            {indexLoaded && (
                                <span
                                    className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0"
                                    style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-glow)' }}
                                >
                                    {file.index} · {file.count.toLocaleString(locale)}
                                    <button
                                        onClick={() => screener.setIndexLoaded(false)}
                                        className="hover:opacity-70 leading-none"
                                        style={{ color: 'var(--accent)', opacity: 0.6 }}
                                        title={t('screenerPage.removeUniverse', { index: file.index })}
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
                                        title={t('screenerPage.removeTicker', { ticker: c.code })}
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
                                    onLoadIndex={key => screener.setIndex(key, true)}
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
                                notes={notes}
                                onEditNote={handleEditNote}
                                onOpenChart={handleOpenChart}
                                onBuy={handleBuy}
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

            {noteTarget && (
                <NoteModal
                    symbol={noteTarget.symbol}
                    name={noteTarget.name}
                    existing={notes[noteTarget.symbol] ?? null}
                    onSave={saveNote}
                    onClear={clearNote}
                    onClose={() => setNoteTarget(null)}
                />
            )}

            {buyTarget && (
                <AddPositionModal
                    setId={getActiveSetId()}
                    initialTicker={buyTarget.symbol}
                    initialName={buyTarget.name}
                    onSaved={() => setBuyTarget(null)}
                    onClose={() => setBuyTarget(null)}
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
                taxFeatureEnabled={taxFeatureEnabled}
                onTaxFeatureEnabledChange={setTaxFeatureEnabled}
            />

            <MobileBottomNav
                activePage="screener"
                settingsOpen={settingsOpen}
                onSettingsToggle={() => setSettingsOpen(o => !o)}
            />
        </div>
    );
}
