'use client';

import { useEffect, useState } from 'react';
import { MdClose, MdNotificationsActive, MdDelete } from 'react-icons/md';
import type { PriceAlert, StockFundamentals } from '../../types/screener';

interface AlertModalProps {
    symbol: string;
    name: string;
    existing: PriceAlert | null;
    onSave: (alert: PriceAlert) => void;
    onClear: () => void;
    onClose: () => void;
}

/**
 * Set/edit a price alert for a screener stock. Alerts are evaluated client-side
 * against the on-the-fly fundamentals price (no background job) — a row is
 * flagged when its latest price crosses the target.
 */
export function AlertModal({ symbol, name, existing, onSave, onClear, onClose }: AlertModalProps) {
    const [target, setTarget] = useState(existing ? String(existing.target) : '');
    const [direction, setDirection] = useState<PriceAlert['direction']>(existing?.direction ?? 'above');
    const [error, setError] = useState<string | null>(null);
    const [currentPrice, setCurrentPrice] = useState<number | null>(null);
    const [currency, setCurrency] = useState<string | null>(null);

    // Fetch the live price for context + as a default target (served from the
    // browser cache if the table already loaded it).
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/screener/quote?symbol=${encodeURIComponent(symbol)}`);
                if (!res.ok || cancelled) return;
                const d = (await res.json()) as StockFundamentals;
                if (cancelled) return;
                setCurrentPrice(d.price);
                setCurrency(d.currency);
                if (!existing && d.price != null) setTarget(prev => prev || String(d.price));
            } catch { /* price is optional context */ }
        })();
        return () => { cancelled = true; };
    }, [symbol, existing]);

    const handleSave = () => {
        const t = parseFloat(target);
        if (isNaN(t) || t <= 0) { setError('Enter a positive target price'); return; }
        onSave({ target: t, direction });
    };

    const inputClass = 'w-full px-3 py-2 rounded-lg text-sm glass outline-none focus:ring-1';
    const inputStyle = { color: 'var(--text-primary)', caretColor: 'var(--accent)', ['--tw-ring-color' as string]: 'var(--accent)' };

    return (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="relative w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl flex flex-col"
                style={{ background: 'var(--surface-popover)', border: '1px solid var(--border-strong)', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}>
                <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid var(--border)' }}>
                    <div className="flex items-center gap-2 min-w-0">
                        <MdNotificationsActive size={18} style={{ color: 'var(--accent)' }} />
                        <div className="min-w-0">
                            <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Price alert · {symbol}</h2>
                            <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{name}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: 'var(--text-muted)' }} aria-label="Close">
                        <MdClose size={18} />
                    </button>
                </div>

                <div className="px-6 py-5 space-y-4">
                    {error && (
                        <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'var(--pnl-red-dim)', border: '1px solid var(--pnl-red)', color: 'var(--pnl-red)' }}>{error}</div>
                    )}

                    <div className="inline-flex rounded-lg p-0.5 text-sm font-medium w-full" style={{ background: 'var(--glass-bg)', border: '1px solid var(--border)' }}>
                        {(['above', 'below'] as const).map(d => (
                            <button key={d} onClick={() => setDirection(d)} className="flex-1 px-3 py-1.5 rounded-md transition-all capitalize"
                                style={direction === d ? { background: 'var(--accent-dim)', color: 'var(--accent)' } : { color: 'var(--text-secondary)' }}>
                                {d}
                            </button>
                        ))}
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            Target price {currency ? `(${currency})` : ''}{currentPrice != null ? ` · now ${currentPrice.toLocaleString()}` : ''}
                        </label>
                        <input type="number" min="0" step="any" className={inputClass} style={inputStyle}
                            value={target} onChange={e => { setTarget(e.target.value); setError(null); }}
                            onKeyDown={e => { if (e.key === 'Enter') handleSave(); }} autoFocus />
                    </div>

                    <div className="flex gap-3 pt-1">
                        <button onClick={handleSave} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
                            style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-glow)' }}>
                            {existing ? 'Update alert' : 'Set alert'}
                        </button>
                        {existing && (
                            <button onClick={onClear} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium glass transition-all"
                                style={{ color: 'var(--pnl-red)' }}>
                                <MdDelete size={16} /> Clear
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
