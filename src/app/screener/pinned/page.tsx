'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MdChevronLeft, MdDownload, MdUpload, MdClose } from 'react-icons/md';
import { AppSidebar } from '../../../components/layout/AppSidebar';
import { SettingsPanel } from '../../../components/layout/SettingsPanel';
import { MobileBottomNav } from '../../../components/layout/MobileBottomNav';
import { ScreenerTable } from '../../../components/screener/ScreenerTable';
import { AlertModal } from '../../../components/screener/AlertModal';
import { NoteModal } from '../../../components/screener/NoteModal';
import { StockChartModal } from '../../../components/screener/StockChartModal';
import AddPositionModal from '../../../components/management/AddPositionModal';
import { useBaseCurrency } from '../../../hooks/useBaseCurrency';
import { useActiveSetName } from '../../../hooks/useActiveSetName';
import { useAlertPoller } from '../../../hooks/useAlertPoller';
import { useTaxFeatureEnabled } from '../../../hooks/useTaxFeatureEnabled';
import { useScreenerState } from '../../../hooks/useScreenerState';
import { getActiveSetId } from '../../../utils/localPositions';
import { ALL_INDEX_CONSTITUENTS } from '../../../data/indices/registry';
import { buildWatchlistBackup, parseWatchlistBackup, resolveConstituent } from '../../../utils/screenerState';
import type { IndexConstituent, PriceAlert } from '../../../types/screener';
import { useTranslation } from '../../../i18n';
import type { TranslationKey } from '../../../i18n';

type Flash = { kind: 'ok' | 'error'; key: TranslationKey; count?: number };

export default function PinnedPage() {
    const { t } = useTranslation();
    const router = useRouter();
    const { currency, setCurrency } = useBaseCurrency();
    const activeSetName = useActiveSetName();
    const { enabled: taxFeatureEnabled, setEnabled: setTaxFeatureEnabled } = useTaxFeatureEnabled();
    const screener = useScreenerState();
    const { added, pinned, alerts, notes } = screener;

    const [settingsOpen, setSettingsOpen] = useState(false);
    const [alertTarget, setAlertTarget] = useState<IndexConstituent | null>(null);
    const [noteTarget, setNoteTarget] = useState<IndexConstituent | null>(null);
    const [chartTarget, setChartTarget] = useState<{ c: IndexConstituent; currency: string | null } | null>(null);
    const [buyTarget, setBuyTarget] = useState<IndexConstituent | null>(null);
    const [flash, setFlash] = useState<Flash | null>(null);
    const fileInput = useRef<HTMLInputElement>(null);

    useAlertPoller(alerts);

    const rows = useMemo(
        () => pinned.map(s => resolveConstituent(s, added, ALL_INDEX_CONSTITUENTS)),
        [pinned, added],
    );
    const pinnedSet = useMemo(() => new Set(pinned), [pinned]);

    const handleEditAlert = useCallback((c: IndexConstituent) => setAlertTarget(c), []);
    const handleEditNote = useCallback((c: IndexConstituent) => setNoteTarget(c), []);
    const handleBuy = useCallback((c: IndexConstituent) => setBuyTarget(c), []);
    const handleOpenChart = useCallback((c: IndexConstituent, cur: string | null) => setChartTarget({ c, currency: cur }), []);

    const handleExport = () => {
        const backup = buildWatchlistBackup(
            { index: '', indexLoaded: false, added, pinned, alerts, notes },
            ALL_INDEX_CONSTITUENTS,
        );
        if (!backup) return;
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pinned-stocks-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        try {
            const items = parseWatchlistBackup(JSON.parse(await file.text()));
            if (!items) { setFlash({ kind: 'error', key: 'pinnedPage.importErrShape' }); return; }
            screener.importWatchlist(items, ALL_INDEX_CONSTITUENTS);
            setFlash({ kind: 'ok', key: 'pinnedPage.imported', count: items.length });
        } catch {
            setFlash({ kind: 'error', key: 'pinnedPage.importErrFailed' });
        }
    };

    const saveAlert = (alert: PriceAlert) => {
        if (!alertTarget) return;
        screener.setAlert(alertTarget.symbol, alert);
        setAlertTarget(null);
        if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
            void Notification.requestPermission();
        }
    };

    const btn = 'h-8 flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium transition-all hover:opacity-80 disabled:opacity-40';
    const btnStyle = { color: 'var(--text-secondary)', background: 'var(--glass-bg)', border: '1px solid var(--border)' };

    return (
        <div className="flex h-dvh overflow-hidden" style={{ background: 'var(--bg-base)' }}>
            <AppSidebar activePage="pinned" currency={currency} activeSetName={activeSetName} taxFeatureEnabled={taxFeatureEnabled} />

            <div className="flex-1 min-w-0 md:ml-[200px] flex flex-col h-dvh overflow-hidden">
                <div className="flex-1 min-h-0 pb-20 md:pb-0 overflow-hidden">
                    <div className="max-w-screen-xl mx-auto px-3 sm:px-5 pt-4 sm:pt-5 pb-4 h-full flex flex-col gap-3">

                        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                            <button onClick={() => router.push('/screener')} className="flex items-center hover:opacity-70"
                                style={{ color: 'var(--text-muted)' }} aria-label={t('pinnedPage.back')} title={t('pinnedPage.back')}>
                                <MdChevronLeft size={20} />
                            </button>
                            <h1 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t('pinnedPage.title')}</h1>
                            <span className="text-xs hidden sm:inline" style={{ color: 'var(--text-muted)' }}>{t('pinnedPage.subtitle')}</span>
                            <div className="ml-auto flex items-center gap-1.5">
                                <button onClick={() => fileInput.current?.click()} className={btn} style={btnStyle} title={t('pinnedPage.importHint')}>
                                    <MdUpload size={14} /> {t('pinnedPage.import')}
                                </button>
                                <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={handleImport} />
                                <button onClick={handleExport} disabled={pinned.length === 0} className={btn} style={btnStyle} title={t('pinnedPage.exportHint')}>
                                    <MdDownload size={14} /> {t('pinnedPage.export')}
                                </button>
                            </div>
                        </div>

                        {flash && (
                            <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs flex-shrink-0"
                                style={flash.kind === 'ok'
                                    ? { background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-glow)' }
                                    : { background: 'var(--pnl-red-dim)', color: 'var(--pnl-red)', border: '1px solid var(--pnl-red)' }}>
                                <span className="flex-1">{t(flash.key, { count: flash.count ?? 0 })}</span>
                                <button onClick={() => setFlash(null)} aria-label={t('common.close')}><MdClose size={13} /></button>
                            </div>
                        )}

                        <div className="flex-1 min-h-0">
                            <ScreenerTable
                                variant="pinned"
                                constituents={rows}
                                pinnedSymbols={pinnedSet}
                                onTogglePin={screener.togglePin}
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
                    onClear={() => { screener.setAlert(alertTarget.symbol, null); setAlertTarget(null); }}
                    onClose={() => setAlertTarget(null)}
                />
            )}

            {noteTarget && (
                <NoteModal
                    symbol={noteTarget.symbol}
                    name={noteTarget.name}
                    existing={notes[noteTarget.symbol] ?? null}
                    onSave={note => { screener.setNote(noteTarget.symbol, note); setNoteTarget(null); }}
                    onClear={() => { screener.setNote(noteTarget.symbol, null); setNoteTarget(null); }}
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
                    symbol={chartTarget.c.symbol}
                    name={chartTarget.c.name}
                    currency={chartTarget.currency}
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
                activePage="pinned"
                settingsOpen={settingsOpen}
                onSettingsToggle={() => setSettingsOpen(o => !o)}
            />
        </div>
    );
}
