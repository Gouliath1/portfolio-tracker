'use client';

import { useState, useEffect, useRef } from 'react';
import { MdClose, MdAdd, MdInfo } from 'react-icons/md';
import { RawPosition } from '@portfolio/types';
import { DEMO_SET_ID } from '../../data/demoPositions';
import { getPositionsForSet } from '../../utils/localPositions';

interface AddPositionModalProps {
    setId: string;
    onSaved: () => void;
    onClose: () => void;
}

const CURRENCIES = ['USD', 'JPY', 'EUR', 'GBP', 'HKD', 'SGD', 'AUD', 'CAD', 'CHF', 'CNY', 'KRW'];

const EMPTY = {
    ticker: '',
    fullName: '',
    broker: '',
    account: '',
    quantity: '',
    costPerUnit: '',
    fees: '',
    transactionCcy: 'USD',
    stockCcy: 'USD',
    transactionDate: '',
};

type FormState = typeof EMPTY;

function toRawPosition(f: FormState): RawPosition {
    const qty = parseFloat(f.quantity);
    const cpu = parseFloat(f.costPerUnit);
    const fees = parseFloat(f.fees) || 0;
    const effectiveCostPerUnit = fees > 0 ? (cpu * qty + fees) / qty : cpu;

    return {
        ticker: f.ticker.trim().toUpperCase(),
        fullName: f.fullName.trim(),
        broker: f.broker.trim() || undefined,
        account: f.account.trim(),
        quantity: qty,
        costPerUnit: effectiveCostPerUnit,
        transactionCcy: f.transactionCcy,
        stockCcy: f.stockCcy,
        transactionDate: f.transactionDate.replace(/-/g, '/'),
    };
}

function validate(f: FormState): string | null {
    if (!f.ticker.trim()) return 'Ticker is required';
    if (!f.fullName.trim()) return 'Company name is required';
    if (!f.account.trim()) return 'Account is required';
    if (!f.quantity || isNaN(parseFloat(f.quantity)) || parseFloat(f.quantity) <= 0)
        return 'Quantity must be a positive number';
    if (!f.costPerUnit || isNaN(parseFloat(f.costPerUnit)) || parseFloat(f.costPerUnit) < 0)
        return 'Cost per unit must be a non-negative number';
    if (f.fees && (isNaN(parseFloat(f.fees)) || parseFloat(f.fees) < 0))
        return 'Fees must be a non-negative number';
    if (!f.transactionDate) return 'Transaction date is required';
    return null;
}

function useKnownValues(setId: string) {
    const positions = getPositionsForSet(setId);
    const brokers = [...new Set(positions.map(p => p.broker).filter(Boolean) as string[])];
    const accounts = [...new Set(positions.map(p => p.account).filter(Boolean))];
    return { brokers, accounts };
}

export default function AddPositionModal({ setId, onSaved, onClose }: AddPositionModalProps) {
    const [form, setForm] = useState<FormState>(EMPTY);
    const [error, setError] = useState<string | null>(null);
    const [nameLookupState, setNameLookupState] = useState<'idle' | 'loading' | 'found' | 'not-found'>('idle');
    const [nameOverridden, setNameOverridden] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const { brokers, accounts } = useKnownValues(setId);

    const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const value = e.target.value;
        setForm(p => ({ ...p, [key]: value }));

        if (key === 'ticker') {
            setNameOverridden(false);
            setNameLookupState('idle');
        }
    };

    // Debounced ticker → company name lookup
    useEffect(() => {
        const ticker = form.ticker.trim();
        if (!ticker || nameOverridden) return;

        if (debounceRef.current) clearTimeout(debounceRef.current);

        debounceRef.current = setTimeout(async () => {
            setNameLookupState('loading');
            try {
                const res = await fetch(`/api/ticker-info?symbol=${encodeURIComponent(ticker.toUpperCase())}`);
                const data = await res.json();
                if (data.name) {
                    setForm(p => ({ ...p, fullName: data.name }));
                    setNameLookupState('found');
                } else {
                    setNameLookupState('not-found');
                }
            } catch {
                setNameLookupState('not-found');
            }
        }, 600);

        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [form.ticker, nameOverridden]);

    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setForm(p => ({ ...p, fullName: e.target.value }));
        setNameOverridden(true);
        setNameLookupState('idle');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const err = validate(form);
        if (err) { setError(err); return; }
        const { addPositionToSet } = await import('../../utils/localPositions');
        addPositionToSet(setId, toRawPosition(form));
        onSaved();
    };

    const inputClass = 'w-full px-3 py-2 rounded-lg text-sm glass outline-none focus:ring-1';
    const inputStyle = { color: 'var(--text-primary)', caretColor: 'var(--accent)', ['--tw-ring-color' as string]: 'var(--accent)' };
    const labelStyle = { color: 'var(--text-muted)' };

    const totalCost = (() => {
        const qty = parseFloat(form.quantity);
        const cpu = parseFloat(form.costPerUnit);
        const fees = parseFloat(form.fees) || 0;
        if (!isNaN(qty) && !isNaN(cpu) && qty > 0 && cpu >= 0) {
            return (qty * cpu + fees).toFixed(2);
        }
        return null;
    })();

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                className="relative w-full max-w-lg rounded-2xl flex flex-col"
                style={{
                    background: 'var(--surface-popover)',
                    border: '1px solid var(--border-strong)',
                    boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
                    maxHeight: '90vh',
                }}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid var(--border)' }}>
                    <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Add position</h2>
                    <button onClick={onClose} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }} aria-label="Close">
                        <MdClose size={18} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

                    {setId === DEMO_SET_ID && (
                        <div className="flex gap-2 rounded-xl px-4 py-3 text-sm" style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-glow)' }}>
                            <MdInfo size={16} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                            <p style={{ color: 'var(--text-secondary)' }}>
                                This will create a new <strong style={{ color: 'var(--text-primary)' }}>My Portfolio</strong> set with the demo positions plus this one, and activate it.
                            </p>
                        </div>
                    )}

                    {error && (
                        <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'var(--pnl-red-dim)', border: '1px solid var(--pnl-red)', color: 'var(--pnl-red)' }}>
                            {error}
                        </div>
                    )}

                    {/* Ticker + Company name */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-xs" style={labelStyle}>Ticker *</label>
                            <input
                                className={inputClass} style={inputStyle}
                                value={form.ticker} onChange={set('ticker')}
                                placeholder="AAPL"
                                autoFocus
                                autoComplete="off"
                            />
                        </div>
                        <div className="space-y-1">
                            <div className="flex items-center justify-between h-4">
                                <label className="text-xs" style={labelStyle}>Company name *</label>
                                {nameLookupState === 'loading' && (
                                    <span className="text-xs" style={{ color: 'var(--accent)' }}>Looking up…</span>
                                )}
                                {nameLookupState === 'found' && !nameOverridden && (
                                    <span className="text-xs" style={{ color: 'var(--pnl-green)' }}>Auto-filled</span>
                                )}
                            </div>
                            <input
                                className={inputClass} style={inputStyle}
                                value={form.fullName} onChange={handleNameChange}
                                placeholder="Apple Inc."
                            />
                        </div>
                    </div>

                    {/* Quantity + Cost per unit + Fees */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1">
                            <label className="text-xs" style={labelStyle}>Quantity *</label>
                            <input
                                type="number" min="0" step="any"
                                className={inputClass} style={inputStyle}
                                value={form.quantity} onChange={set('quantity')}
                                placeholder="10"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs" style={labelStyle}>Cost per unit *</label>
                            <input
                                type="number" min="0" step="any"
                                className={inputClass} style={inputStyle}
                                value={form.costPerUnit} onChange={set('costPerUnit')}
                                placeholder="150.00"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs" style={labelStyle}>Fees</label>
                            <input
                                type="number" min="0" step="any"
                                className={inputClass} style={inputStyle}
                                value={form.fees} onChange={set('fees')}
                                placeholder="0.00"
                            />
                        </div>
                    </div>

                    {/* Total cost hint */}
                    {totalCost && (
                        <p className="text-xs -mt-3" style={{ color: 'var(--text-muted)' }}>
                            Total cost: <span style={{ color: 'var(--text-secondary)' }}>{totalCost} {form.transactionCcy}</span>
                            {parseFloat(form.fees) > 0 && (
                                <span> · effective cost/unit: {((parseFloat(form.quantity) * parseFloat(form.costPerUnit) + parseFloat(form.fees)) / parseFloat(form.quantity)).toFixed(4)}</span>
                            )}
                        </p>
                    )}

                    {/* Currencies */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-xs" style={labelStyle}>Transaction currency *</label>
                            <select className={inputClass} style={inputStyle} value={form.transactionCcy} onChange={set('transactionCcy')}>
                                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs" style={labelStyle}>Stock currency *</label>
                            <select className={inputClass} style={inputStyle} value={form.stockCcy} onChange={set('stockCcy')}>
                                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Date */}
                    <div className="space-y-1">
                        <label className="text-xs" style={labelStyle}>Transaction date *</label>
                        <input
                            type="date"
                            className={inputClass} style={inputStyle}
                            value={form.transactionDate} onChange={set('transactionDate')}
                        />
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            Used to look up the historical FX rate at time of purchase.
                        </p>
                    </div>

                    {/* Broker + Account with datalist suggestions */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-xs" style={labelStyle}>Broker</label>
                            <input
                                list="brokers-list"
                                className={inputClass} style={inputStyle}
                                value={form.broker} onChange={set('broker')}
                                placeholder="My Broker"
                                autoComplete="off"
                            />
                            <datalist id="brokers-list">
                                {brokers.map(b => <option key={b} value={b} />)}
                            </datalist>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs" style={labelStyle}>Account *</label>
                            <input
                                list="accounts-list"
                                className={inputClass} style={inputStyle}
                                value={form.account} onChange={set('account')}
                                placeholder="Main Account"
                                autoComplete="off"
                            />
                            <datalist id="accounts-list">
                                {accounts.map(a => <option key={a} value={a} />)}
                            </datalist>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="submit"
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
                            style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-glow)' }}
                        >
                            <MdAdd size={16} />
                            Add position
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2.5 rounded-xl text-sm font-medium glass glass-hover transition-all"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
