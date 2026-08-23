'use client';

import { useState } from 'react';
import { MdAdd, MdExpandMore, MdShowChart, MdPlaylistAdd } from 'react-icons/md';
import { TickerInput } from './TickerInput';
import { PasteListModal } from './PasteListModal';
import type { IndexConstituent, IndexConstituentsFile } from '../../types/screener';
import { useTranslation } from '../../i18n';

interface AddMenuProps {
    indices: Record<string, IndexConstituentsFile>;
    currentIndexKey: string | null;
    onLoadIndex: (key: string) => void;
    onAddTicker: (c: IndexConstituent) => void;
    onAddMany: (cs: IndexConstituent[]) => void;
}

/**
 * Single entry point for building the screen: add a ticker, load an index, or
 * paste a list — replacing the old dropdown + separate search box. The filter
 * box (search within the list) lives in the table, so there's no longer a
 * confusing second "search".
 */
export function AddMenu({ indices, currentIndexKey, onLoadIndex, onAddTicker, onAddMany }: AddMenuProps) {
    const { t, locale } = useTranslation();
    const [open, setOpen] = useState(false);
    const [pasteOpen, setPasteOpen] = useState(false);

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(o => !o)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all"
                style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-glow)' }}
            >
                <MdAdd size={16} /> {t('common.add')} <MdExpandMore size={16} />
            </button>

            {open && (
                <>
                    {/* click-away backdrop */}
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div
                        className="absolute right-0 top-full mt-2 z-50 w-72 rounded-xl p-3 space-y-3"
                        style={{ background: 'var(--surface-popover)', border: '1px solid var(--border-strong)', boxShadow: '0 16px 48px rgba(0,0,0,0.5)' }}
                    >
                        {/* Add a single ticker */}
                        <div className="space-y-1.5">
                            <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{t('addMenu.addTicker')}</div>
                            <TickerInput onAdd={c => { onAddTicker(c); setOpen(false); }} />
                        </div>

                        <div style={{ borderTop: '1px solid var(--border)' }} />

                        {/* Load an index */}
                        <div className="space-y-1.5">
                            <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{t('addMenu.loadIndex')}</div>
                            {Object.entries(indices).map(([key, f]) => (
                                <button
                                    key={key}
                                    onClick={() => { onLoadIndex(key); setOpen(false); }}
                                    className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-sm transition-all hover:opacity-80"
                                    style={key === currentIndexKey
                                        ? { background: 'var(--accent-dim)', color: 'var(--accent)' }
                                        : { color: 'var(--text-secondary)' }}
                                >
                                    <span className="flex items-center gap-2"><MdShowChart size={15} /> {f.index}</span>
                                    <span className="text-xs" style={{ opacity: 0.6 }}>{t('addMenu.stockCount', { count: f.count.toLocaleString(locale) })}</span>
                                </button>
                            ))}
                            {/* Coming-soon indices — shown as disabled to aid discovery */}
                            {[{ name: 'Nikkei 225', count: 225 }, { name: 'S&P 500', count: 500 }].map(f => (
                                <div
                                    key={f.name}
                                    className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-sm"
                                    style={{ color: 'var(--text-muted)', opacity: 0.45, cursor: 'not-allowed' }}
                                    title={t('addMenu.comingSoonTitle')}
                                >
                                    <span className="flex items-center gap-2"><MdShowChart size={15} /> {f.name}</span>
                                    <span className="text-xs">{t('addMenu.comingSoon')}</span>
                                </div>
                            ))}
                        </div>

                        <div style={{ borderTop: '1px solid var(--border)' }} />

                        {/* Paste a list */}
                        <button
                            onClick={() => { setPasteOpen(true); setOpen(false); }}
                            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition-all hover:opacity-80"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            <MdPlaylistAdd size={16} /> {t('addMenu.pasteList')}
                        </button>
                    </div>
                </>
            )}

            {pasteOpen && (
                <PasteListModal onAdd={onAddMany} onClose={() => setPasteOpen(false)} />
            )}
        </div>
    );
}
