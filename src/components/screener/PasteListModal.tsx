'use client';

import { useState } from 'react';
import { MdClose, MdPlaylistAdd } from 'react-icons/md';
import type { IndexConstituent } from '../../types/screener';

interface PasteListModalProps {
    onAdd: (constituents: IndexConstituent[]) => void;
    onClose: () => void;
}

/**
 * Bulk-add tickers from a pasted list (CSV / newline / space separated). Names
 * are left as the symbol — they get backfilled from the chart endpoint when the
 * row's data loads, so no per-ticker lookup is needed here.
 */
export function PasteListModal({ onAdd, onClose }: PasteListModalProps) {
    const [text, setText] = useState('');

    const parsed = Array.from(
        new Set(
            text
                .split(/[\s,;]+/)
                .map(s => s.trim().toUpperCase())
                .filter(Boolean),
        ),
    );

    const handleAdd = () => {
        if (parsed.length === 0) return;
        onAdd(parsed.map(symbol => ({ symbol, code: symbol.split('.')[0], name: symbol, sector: null })));
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="relative w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl flex flex-col"
                style={{ background: 'var(--surface-popover)', border: '1px solid var(--border-strong)', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}>
                <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid var(--border)' }}>
                    <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Paste a list of tickers</h2>
                    <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: 'var(--text-muted)' }} aria-label="Close"><MdClose size={18} /></button>
                </div>
                <div className="px-6 py-5 space-y-3">
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        Separate by commas, spaces, or new lines. Use Yahoo symbols (e.g. <code>7203.T</code>, <code>AAPL</code>).
                    </p>
                    <textarea
                        value={text}
                        onChange={e => setText(e.target.value)}
                        rows={6}
                        placeholder="7203.T, 6758.T, AAPL&#10;MSFT 8306.T"
                        className="w-full px-3 py-2 rounded-lg text-sm glass outline-none focus:ring-1 font-mono"
                        style={{ color: 'var(--text-primary)', caretColor: 'var(--accent)', ['--tw-ring-color' as string]: 'var(--accent)' }}
                        autoFocus
                    />
                    <div className="flex items-center justify-between gap-3 pt-1">
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            {parsed.length} ticker{parsed.length === 1 ? '' : 's'} detected
                        </span>
                        <button onClick={handleAdd} disabled={parsed.length === 0}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-40"
                            style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-glow)' }}>
                            <MdPlaylistAdd size={16} /> Add {parsed.length || ''}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
