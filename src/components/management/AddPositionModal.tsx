'use client';

import { useState } from 'react';
import { MdClose, MdAdd, MdInfo } from 'react-icons/md';
import { Transaction, Currency } from '@portfolio/types';
import { DEMO_SET_ID } from '../../data/demoPositions';
import { getTransactionsForSet, MY_PORTFOLIO_NAME } from '../../utils/localPositions';
import { useTickerName } from '../../hooks/useTickerName';
import { useTranslation } from '../../i18n';
import type { TranslationKey } from '../../i18n';

interface AddPositionModalProps {
    setId: string;
    onSaved: () => void;
    onClose: () => void;
    initialTicker?: string;
    initialName?: string;
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

// Today as YYYY-MM-DD (local), used to pre-fill the date field.
function todayIso(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toTransaction(f: FormState): Transaction {
    const qty = parseFloat(f.quantity);
    const cpu = parseFloat(f.costPerUnit);
    const fees = parseFloat(f.fees) || 0;

    return {
        way: 'buy',
        date: f.transactionDate.trim().replace(/-/g, '/'),
        ticker: f.ticker.trim().toUpperCase(),
        fullName: f.fullName.trim(),
        broker: f.broker.trim() || undefined,
        account: f.account.trim(),
        quantity: qty,
        pricePerUnit: cpu,
        fees,
        ccy: f.transactionCcy as Currency,
        stockCcy: f.stockCcy as Currency,
    };
}

/** Returns the key of the first failing rule, or null when the form is valid. */
export function validate(f: FormState): TranslationKey | null {
    if (!f.ticker.trim()) return 'addPosition.errTickerRequired';
    if (!f.fullName.trim()) return 'addPosition.errNameRequired';
    if (!f.account.trim()) return 'addPosition.errAccountRequired';
    const qty = parseFloat(f.quantity);
    if (!f.quantity || isNaN(qty) || qty <= 0) return 'addPosition.errQuantity';
    const cpu = parseFloat(f.costPerUnit);
    if (!f.costPerUnit || isNaN(cpu) || cpu < 0) return 'addPosition.errCostPerUnit';
    if (f.fees) {
        const fees = parseFloat(f.fees);
        if (isNaN(fees) || fees < 0) return 'addPosition.errFees';
    }
    if (!f.transactionDate.trim()) return 'addPosition.errDateRequired';
    const norm = f.transactionDate.trim().replace(/\//g, '-');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(norm)) return 'addPosition.errDateFormat';
    // Reject impossible dates like 2023-02-31 (Date silently rolls them over).
    const [y, m, day] = norm.split('-').map(Number);
    const d = new Date(`${norm}T00:00:00`);
    if (isNaN(d.getTime()) || d.getFullYear() !== y || d.getMonth() + 1 !== m || d.getDate() !== day) {
        return 'addPosition.errDateInvalid';
    }
    if (d.getTime() > Date.now()) return 'addPosition.errDateFuture';
    return null;
}

function useKnownValues(setId: string) {
    const txs = getTransactionsForSet(setId);
    const brokers = [...new Set(txs.map(p => p.broker).filter(Boolean) as string[])];
    const accounts = [...new Set(txs.map(p => p.account).filter(Boolean))];
    return { brokers, accounts };
}

export default function AddPositionModal({ setId, onSaved, onClose, initialTicker, initialName }: AddPositionModalProps) {
    const { t } = useTranslation();
    const [form, setForm] = useState<FormState>({
        ...EMPTY,
        transactionDate: todayIso(),
        ticker: initialTicker ?? '',
        fullName: initialName ?? '',
    });
    const [error, setError] = useState<TranslationKey | null>(null);
    const [nameOverridden, setNameOverridden] = useState(!!initialName);

    const { brokers, accounts } = useKnownValues(setId);

    // Debounced ticker → company name lookup (shared with the screener).
    const nameLookupState = useTickerName(
        form.ticker,
        name => { if (name) setForm(p => ({ ...p, fullName: name })); },
        { enabled: !nameOverridden },
    );

    const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const value = e.target.value;
        setForm(p => ({ ...p, [key]: value }));

        if (key === 'ticker') {
            setNameOverridden(false);
        }
    };

    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setForm(p => ({ ...p, fullName: e.target.value }));
        setNameOverridden(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const err = validate(form);
        if (err) { setError(err); return; }
        const { addTransactionToSet } = await import('../../utils/localPositions');
        addTransactionToSet(setId, toTransaction(form));
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
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                className="relative w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl flex flex-col"
                style={{
                    background: 'var(--surface-popover)',
                    border: '1px solid var(--border-strong)',
                    boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
                    maxHeight: '90dvh',
                }}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid var(--border)' }}>
                    <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{t('addPosition.title')}</h2>
                    <button onClick={onClose} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }} aria-label={t('common.close')}>
                        <MdClose size={18} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

                    {setId === DEMO_SET_ID && (
                        <div className="flex gap-2 rounded-xl px-4 py-3 text-sm" style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-glow)' }}>
                            <MdInfo size={16} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                            <p style={{ color: 'var(--text-secondary)' }}>
                                {t('addPosition.demoNoticeBefore')}
                                <strong style={{ color: 'var(--text-primary)' }}>{MY_PORTFOLIO_NAME}</strong>
                                {t('addPosition.demoNoticeAfter')}
                            </p>
                        </div>
                    )}

                    {error && (
                        <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'var(--pnl-red-dim)', border: '1px solid var(--pnl-red)', color: 'var(--pnl-red)' }}>
                            {t(error)}
                        </div>
                    )}

                    {/* Ticker + Company name */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-xs" style={labelStyle}>{t('addPosition.ticker')} *</label>
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
                                <label className="text-xs" style={labelStyle}>{t('addPosition.companyName')} *</label>
                                {nameLookupState === 'loading' && (
                                    <span className="text-xs" style={{ color: 'var(--accent)' }}>{t('addPosition.lookingUp')}</span>
                                )}
                                {nameLookupState === 'found' && !nameOverridden && (
                                    <span className="text-xs" style={{ color: 'var(--pnl-green)' }}>{t('addPosition.autoFilled')}</span>
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
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                            <label className="text-xs" style={labelStyle}>{t('addPosition.quantity')} *</label>
                            <input
                                type="number" min="0" step="any"
                                className={inputClass} style={inputStyle}
                                value={form.quantity} onChange={set('quantity')}
                                placeholder="10"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs" style={labelStyle}>{t('addPosition.costPerUnit')} *</label>
                            <input
                                type="number" min="0" step="any"
                                className={inputClass} style={inputStyle}
                                value={form.costPerUnit} onChange={set('costPerUnit')}
                                placeholder="150.00"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs" style={labelStyle}>{t('addPosition.fees')}</label>
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
                            {t('addPosition.totalCost')}: <span style={{ color: 'var(--text-secondary)' }}>{totalCost} {form.transactionCcy}</span>
                            {parseFloat(form.fees) > 0 && (
                                <span> · {t('addPosition.effectiveCostPerUnit', {
                                    value: ((parseFloat(form.quantity) * parseFloat(form.costPerUnit) + parseFloat(form.fees)) / parseFloat(form.quantity)).toFixed(4),
                                })}</span>
                            )}
                        </p>
                    )}

                    {/* Currencies */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-xs" style={labelStyle}>{t('addPosition.transactionCurrency')} *</label>
                            <select className={inputClass} style={inputStyle} value={form.transactionCcy} onChange={set('transactionCcy')}>
                                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs" style={labelStyle}>{t('addPosition.stockCurrency')} *</label>
                            <select className={inputClass} style={inputStyle} value={form.stockCcy} onChange={set('stockCcy')}>
                                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Date — typed manually, defaults to today */}
                    <div className="space-y-1">
                        <label className="text-xs" style={labelStyle}>{t('addPosition.transactionDate')} *</label>
                        <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            placeholder="YYYY-MM-DD"
                            className={inputClass} style={inputStyle}
                            value={form.transactionDate} onChange={set('transactionDate')}
                        />
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            {t('addPosition.dateHelp')}
                        </p>
                    </div>

                    {/* Broker + Account with datalist suggestions */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-xs" style={labelStyle}>{t('addPosition.broker')}</label>
                            <input
                                list="brokers-list"
                                className={inputClass} style={inputStyle}
                                value={form.broker} onChange={set('broker')}
                                placeholder={t('addPosition.brokerPlaceholder')}
                                autoComplete="off"
                            />
                            <datalist id="brokers-list">
                                {brokers.map(b => <option key={b} value={b} />)}
                            </datalist>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs" style={labelStyle}>{t('addPosition.account')} *</label>
                            <input
                                list="accounts-list"
                                className={inputClass} style={inputStyle}
                                value={form.account} onChange={set('account')}
                                placeholder={t('addPosition.accountPlaceholder')}
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
                            {t('addPosition.submit')}
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2.5 rounded-xl text-sm font-medium glass glass-hover transition-all"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            {t('common.cancel')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
