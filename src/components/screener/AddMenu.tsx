'use client';

import { useState } from 'react';
import { MdAdd, MdExpandMore, MdShowChart, MdPlaylistAdd } from 'react-icons/md';
import { TickerInput } from './TickerInput';
import { PasteListModal } from './PasteListModal';
import type { IndexConstituent, IndexConstituentsFile } from '../../types/screener';

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
    const [open, setOpen] = useState(false);
    const [pasteOpen, setPasteOpen] = useState(false);

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(o => !o)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all"
                style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-glow)' }}
            >
                <MdAdd size={16} /> Add <MdExpandMore size={16} />
            </button>

            {open && (
                <>
                    {/* click-away backdrop */}
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div
                        className="absolute left-0 top-full mt-2 z-50 w-72 rounded-xl p-3 space-y-3"
                        style={{ background: 'var(--surface-popover)', border: '1px solid var(--border-strong)', boxShadow: '0 16px 48px rgba(0,0,0,0.5)' }}
                    >
                        {/* Add a single ticker */}
                        <div className="space-y-1.5">
                            <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Add a ticker</div>
                            <TickerInput onAdd={c => { onAddTicker(c); setOpen(false); }} />
                        </div>

                        <div style={{ borderTop: '1px solid var(--border)' }} />

                        {/* Load an index */}
                        <div className="space-y-1.5">
                            <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Load an index</div>
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
                                    <span style={{ opacity: 0.6 }}>{f.count}</span>
                                </button>
                            ))}
                        </div>

                        <div style={{ borderTop: '1px solid var(--border)' }} />

                        {/* Paste a list */}
                        <button
                            onClick={() => { setPasteOpen(true); setOpen(false); }}
                            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition-all hover:opacity-80"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            <MdPlaylistAdd size={16} /> Paste a list (CSV)…
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
