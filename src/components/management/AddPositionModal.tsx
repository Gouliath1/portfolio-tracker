'use client';

import { useState } from 'react';
import { MdClose, MdAdd } from 'react-icons/md';
import { RawPosition } from '@portfolio/types';

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
    transactionCcy: 'USD',
    stockCcy: 'USD',
    transactionDate: '',
};

type FormState = typeof EMPTY;

function toRawPosition(f: FormState): RawPosition {
    return {
        ticker: f.ticker.trim().toUpperCase(),
        fullName: f.fullName.trim(),
        broker: f.broker.trim() || undefined,
        account: f.account.trim(),
        quantity: parseFloat(f.quantity),
        costPerUnit: parseFloat(f.costPerUnit),
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
    if (!f.transactionDate) return 'Transaction date is required';
    return null;
}

export default function AddPositionModal({ setId, onSaved, onClose }: AddPositionModalProps) {
    const [form, setForm] = useState<FormState>(EMPTY);
    const [error, setError] = useState<string | null>(null);

    const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setForm(p => ({ ...p, [key]: e.target.value }));

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

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
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

                    {error && (
                        <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'var(--pnl-red-dim)', border: '1px solid var(--pnl-red)', color: 'var(--pnl-red)' }}>
                            {error}
                        </div>
                    )}

                    {/* Ticker + Name */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-xs" style={labelStyle}>Ticker *</label>
                            <input
                                className={inputClass} style={inputStyle}
                                value={form.ticker} onChange={set('ticker')}
                                placeholder="AAPL"
                                autoFocus
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs" style={labelStyle}>Company name *</label>
                            <input
                                className={inputClass} style={inputStyle}
                                value={form.fullName} onChange={set('fullName')}
                                placeholder="Apple Inc."
                            />
                        </div>
                    </div>

                    {/* Quantity + Cost */}
                    <div className="grid grid-cols-2 gap-3">
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
                    </div>

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

                    {/* Broker + Account */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-xs" style={labelStyle}>Broker</label>
                            <input
                                className={inputClass} style={inputStyle}
                                value={form.broker} onChange={set('broker')}
                                placeholder="My Broker"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs" style={labelStyle}>Account *</label>
                            <input
                                className={inputClass} style={inputStyle}
                                value={form.account} onChange={set('account')}
                                placeholder="Main Account"
                            />
                        </div>
                    </div>

                    {/* Footer actions */}
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
