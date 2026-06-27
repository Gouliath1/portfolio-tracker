'use client';

import { useEffect, useState } from 'react';
import { MdClose, MdNotificationsActive, MdDelete, MdArrowUpward, MdArrowDownward, MdKeyboardArrowUp, MdKeyboardArrowDown } from 'react-icons/md';
import type { PriceAlert, StockFundamentals } from '../../types/screener';

interface AlertModalProps {
    symbol: string;
    name: string;
    existing: PriceAlert | null;
    onSave: (alert: PriceAlert) => void;
    onClear: () => void;
    onClose: () => void;
}

function stepFor(price: number | null): number {
    if (!price) return 1;
    if (price < 100) return 1;
    if (price < 500) return 5;
    if (price < 2000) return 10;
    if (price < 5000) return 50;
    if (price < 20000) return 100;
    return 500;
}

export function AlertModal({ symbol, name, existing, onSave, onClear, onClose }: AlertModalProps) {
    const [above, setAbove] = useState(existing?.targetAbove != null ? String(existing.targetAbove) : '');
    const [below, setBelow] = useState(existing?.targetBelow != null ? String(existing.targetBelow) : '');
    const [error, setError] = useState<string | null>(null);
    const [currentPrice, setCurrentPrice] = useState<number | null>(null);
    const [currency, setCurrency] = useState<string | null>(null);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

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
                // Pre-fill with current price for new alerts
                if (!existing && d.price != null) {
                    setAbove(prev => prev || String(d.price));
                    setBelow(prev => prev || String(d.price));
                }
            } catch { /* price is optional context */ }
        })();
        return () => { cancelled = true; };
    }, [symbol, existing]);

    const nudge = (value: string, setter: (v: string) => void, dir: 1 | -1) => {
        const base = value.trim() ? parseFloat(value) : (currentPrice ?? 0);
        const step = stepFor(currentPrice ?? base);
        setter(String(Math.max(0, base + dir * step)));
        setError(null);
    };

    const handleSave = () => {
        const ta = above.trim() ? parseFloat(above) : undefined;
        const tb = below.trim() ? parseFloat(below) : undefined;
        if (ta !== undefined && (isNaN(ta) || ta <= 0)) { setError('Above price must be a positive number'); return; }
        if (tb !== undefined && (isNaN(tb) || tb <= 0)) { setError('Below price must be a positive number'); return; }
        if (ta == null && tb == null) { setError('Set at least one threshold'); return; }
        onSave({ targetAbove: ta, targetBelow: tb });
    };

    const fmtPrice = (v: number) => currency === 'JPY'
        ? `¥${v.toLocaleString('en', { maximumFractionDigits: 0 })}`
        : v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (currency ? ` ${currency}` : '');

    const step = stepFor(currentPrice);

    const StepInput = ({
        value, onChange, dir, autoFocus: af,
    }: {
        value: string;
        onChange: (v: string) => void;
        dir: 'above' | 'below';
        autoFocus?: boolean;
    }) => (
        <div className="flex items-stretch rounded-lg overflow-hidden text-sm"
            style={{ border: '1px solid var(--border)', background: 'var(--glass-bg)' }}>
            <input
                type="number" min="0" step={step}
                className="flex-1 min-w-0 px-3 py-2 bg-transparent outline-none tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                style={{ color: 'var(--text-primary)', caretColor: 'var(--accent)' }}
                value={value}
                onChange={e => { onChange(e.target.value); setError(null); }}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                autoFocus={af}
            />
            <div className="flex flex-col flex-shrink-0" style={{ borderLeft: '1px solid var(--border)' }}>
                <button
                    type="button"
                    onClick={() => nudge(value, onChange, dir === 'above' ? 1 : -1)}
                    className="flex items-center justify-center px-2 transition-all hover:opacity-70 flex-1"
                    style={{ color: dir === 'above' ? 'var(--pnl-green)' : 'var(--pnl-red)', borderBottom: '1px solid var(--border)' }}
                    tabIndex={-1}
                    title={dir === 'above' ? `+${step}` : `-${step}`}>
                    <MdKeyboardArrowUp size={14} />
                </button>
                <button
                    type="button"
                    onClick={() => nudge(value, onChange, dir === 'above' ? -1 : 1)}
                    className="flex items-center justify-center px-2 transition-all hover:opacity-70 flex-1"
                    style={{ color: 'var(--text-muted)' }}
                    tabIndex={-1}
                    title={dir === 'above' ? `-${step}` : `+${step}`}>
                    <MdKeyboardArrowDown size={14} />
                </button>
            </div>
        </div>
    );

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
                    {currentPrice != null && (
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            Current: <span className="tabular-nums" style={{ color: 'var(--text-secondary)' }}>{fmtPrice(currentPrice)}</span>
                            <span style={{ marginLeft: 8, opacity: 0.6 }}>step ±{step}</span>
                        </p>
                    )}

                    {error && (
                        <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'var(--pnl-red-dim)', border: '1px solid var(--pnl-red)', color: 'var(--pnl-red)' }}>{error}</div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                                <MdArrowUpward size={12} style={{ color: 'var(--pnl-green)' }} />
                                <span className="font-medium">Above</span>
                                <span style={{ color: 'var(--text-muted)' }}>optional</span>
                            </label>
                            <StepInput value={above} onChange={setAbove} dir="above" autoFocus />
                        </div>
                        <div className="space-y-1.5">
                            <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                                <MdArrowDownward size={12} style={{ color: 'var(--pnl-red)' }} />
                                <span className="font-medium">Below</span>
                                <span style={{ color: 'var(--text-muted)' }}>optional</span>
                            </label>
                            <StepInput value={below} onChange={setBelow} dir="below" />
                        </div>
                    </div>

                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        You&apos;ll get a browser notification when the price crosses either threshold. The screener must be open for checks to run.
                    </p>

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
