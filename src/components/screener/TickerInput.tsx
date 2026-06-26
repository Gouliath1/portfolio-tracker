'use client';

import { useState } from 'react';
import { MdAdd } from 'react-icons/md';
import { useTickerName } from '../../hooks/useTickerName';
import type { IndexConstituent } from '../../types/screener';

interface TickerInputProps {
    onAdd: (constituent: IndexConstituent) => void;
}

/**
 * Compact "add a single stock" control for the screener. Reuses the shared
 * debounced ticker→name lookup (same as the buy-stock form), shows the
 * resolved name as confirmation, and emits an IndexConstituent on submit.
 */
export function TickerInput({ onAdd }: TickerInputProps) {
    const [ticker, setTicker] = useState('');
    const [name, setName] = useState<string | null>(null);

    const lookupState = useTickerName(ticker, setName);

    const symbol = ticker.trim().toUpperCase();

    const handleAdd = () => {
        if (!symbol) return;
        onAdd({ symbol, code: symbol.split('.')[0], name: name ?? symbol, sector: null });
        setTicker('');
        setName(null);
    };

    const inputClass = 'px-3 py-2 rounded-lg text-sm glass outline-none focus:ring-1';
    const inputStyle = { color: 'var(--text-primary)', caretColor: 'var(--accent)', ['--tw-ring-color' as string]: 'var(--accent)' };

    return (
        <div className="flex items-start gap-2">
            <div className="flex flex-col gap-1">
                <input
                    className={inputClass}
                    style={{ ...inputStyle, width: '160px' }}
                    value={ticker}
                    onChange={e => { setTicker(e.target.value); setName(null); }}
                    onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
                    placeholder="Add ticker (e.g. 7203.T)"
                    autoComplete="off"
                    aria-label="Add a single ticker"
                />
                <span
                    className="text-xs truncate max-w-[160px] h-4"
                    style={{
                        color: lookupState === 'found' ? 'var(--pnl-green)'
                            : lookupState === 'loading' ? 'var(--accent)'
                                : 'var(--text-muted)',
                        visibility: (symbol && (lookupState === 'loading' || lookupState === 'found' || lookupState === 'not-found')) ? 'visible' : 'hidden',
                    }}
                >
                    {lookupState === 'loading' ? 'Looking up…' : name ?? 'Name not found'}
                </span>
            </div>
            <button
                onClick={handleAdd}
                disabled={!symbol}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-40 flex-shrink-0"
                style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-glow)' }}
            >
                <MdAdd size={15} />
                Add
            </button>
        </div>
    );
}
