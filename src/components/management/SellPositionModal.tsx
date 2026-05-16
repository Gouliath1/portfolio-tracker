'use client';

import { useEffect, useMemo, useState } from 'react';
import { MdClose, MdRemoveCircleOutline, MdInfo } from 'react-icons/md';
import { Position, Transaction } from '@portfolio/types';
import { openQuantityFor } from '@portfolio/core';
import { DEMO_SET_ID } from '../../data/demoPositions';
import { getTransactionsForSet } from '../../utils/localPositions';

interface SellPositionModalProps {
    setId: string;
    position: Position; // the row the user clicked Sell on — provides ticker/account context
    onSaved: () => void;
    onClose: () => void;
}

export default function SellPositionModal({ setId, position, onSaved, onClose }: SellPositionModalProps) {
    const transactions = useMemo(() => getTransactionsForSet(setId), [setId]);
    const availableQty = useMemo(
        () => openQuantityFor(transactions, position.ticker, position.account),
        [transactions, position.ticker, position.account],
    );

    const [sellQty, setSellQty] = useState<string>(String(availableQty));
    const [salePrice, setSalePrice] = useState<string>(
        position.currentPrice !== null ? String(position.currentPrice) : '',
    );
    const [fees, setFees] = useState<string>('');
    const [saleDate, setSaleDate] = useState<string>(new Date().toISOString().slice(0, 10));
    const [error, setError] = useState<string | null>(null);

    const addCommas = (raw: string) => {
        if (!raw) return raw;
        const [int, dec] = raw.split('.');
        const formatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return dec !== undefined ? `${formatted}.${dec}` : formatted;
    };

    const makeNumericHandler = (setter: (v: string) => void) =>
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const raw = e.target.value.replace(/,/g, '');
            if (raw === '' || /^\d*\.?\d*$/.test(raw)) setter(raw);
        };

    // Escape closes the modal.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const qtyNum = parseFloat(sellQty);
    const priceNum = parseFloat(salePrice);
    const feesNum = parseFloat(fees) || 0;

    const isPartial = !isNaN(qtyNum) && qtyNum > 0 && qtyNum < availableQty;
    const netProceedsNum = !isNaN(qtyNum) && !isNaN(priceNum) && qtyNum > 0 && priceNum >= 0
        ? qtyNum * priceNum - feesNum
        : null;
    // JPY and KRW have no minor unit; everything else gets 2 decimals.
    const zeroDecimalCcys = new Set(['JPY', 'KRW']);
    const fmtCcy = (n: number, ccy: string) => {
        const frac = zeroDecimalCcys.has(ccy) ? 0 : 2;
        return n.toLocaleString(undefined, { minimumFractionDigits: frac, maximumFractionDigits: frac });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isNaN(qtyNum) || qtyNum <= 0) return setError('Quantity must be a positive number');
        if (isNaN(priceNum) || priceNum < 0) return setError('Sale price must be a non-negative number');
        if (feesNum < 0) return setError('Fees must be non-negative');
        if (!saleDate) return setError('Sale date is required');

        // Re-check available qty against current storage right before append,
        // to avoid a stale-snapshot oversell if another tab/action changed state.
        const freshAvailable = openQuantityFor(getTransactionsForSet(setId), position.ticker, position.account);
        if (qtyNum > freshAvailable) {
            return setError(`Only ${freshAvailable} available now — refresh and try again`);
        }

        const tx: Transaction = {
            way: 'sell',
            date: saleDate.replace(/-/g, '/'),
            ticker: position.ticker,
            fullName: position.fullName,
            broker: position.broker,
            account: position.account,
            quantity: qtyNum,
            pricePerUnit: priceNum,
            fees: feesNum,
            ccy: position.stockCcy, // proceeds settle in the stock's native currency
            stockCcy: position.stockCcy,
        };

        const { addTransactionToSet } = await import('../../utils/localPositions');
        addTransactionToSet(setId, tx);
        onSaved();
    };

    const inputClass = 'w-full px-3 py-2 rounded-lg text-sm glass outline-none focus:ring-1';
    const inputStyle = { color: 'var(--text-primary)', caretColor: 'var(--accent)', ['--tw-ring-color' as string]: 'var(--accent)' };
    const labelStyle = { color: 'var(--text-muted)' };

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
                <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid var(--border)' }}>
                    <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                        Sell {String(position.ticker)}
                    </h2>
                    <button onClick={onClose} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }} aria-label="Close">
                        <MdClose size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                    {setId === DEMO_SET_ID && (
                        <div className="flex gap-2 rounded-xl px-4 py-3 text-sm" style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-glow)' }}>
                            <MdInfo size={16} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                            <p style={{ color: 'var(--text-secondary)' }}>
                                This will create a new <strong style={{ color: 'var(--text-primary)' }}>My Portfolio</strong> set with the demo positions and activate it.
                            </p>
                        </div>
                    )}

                    <div className="rounded-xl px-4 py-3" style={{ border: '1px solid var(--border)' }}>
                        <div className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
                            Available to sell
                        </div>
                        <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-2xl font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                                {availableQty.toLocaleString()}
                            </span>
                            <span className="text-base font-medium" style={{ color: 'var(--text-secondary)' }}>
                                {String(position.ticker)}
                            </span>
                            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                                in {position.account}
                            </span>
                        </div>
                        <p className="text-xs mt-2 pt-2" style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
                            Cost basis is allocated FIFO across earlier buys. Proceeds settle in {position.stockCcy}.
                        </p>
                    </div>

                    {error && (
                        <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'var(--pnl-red-dim)', border: '1px solid var(--pnl-red)', color: 'var(--pnl-red)' }}>
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-xs" style={labelStyle}>Sell quantity *</label>
                            <input
                                type="text" inputMode="decimal"
                                className={inputClass} style={inputStyle}
                                value={addCommas(sellQty)} onChange={makeNumericHandler(setSellQty)}
                                autoFocus
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs" style={labelStyle}>Sale price/unit *</label>
                            <input
                                type="text" inputMode="decimal"
                                className={inputClass} style={inputStyle}
                                value={addCommas(salePrice)} onChange={makeNumericHandler(setSalePrice)}
                                placeholder="200.00"
                            />
                            {position.currentPrice !== null && (
                                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                                    mkt: {fmtCcy(position.currentPrice, position.stockCcy)} {position.stockCcy}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-xs" style={labelStyle}>Fees</label>
                            <input
                                type="text" inputMode="decimal"
                                className={inputClass} style={inputStyle}
                                value={addCommas(fees)} onChange={makeNumericHandler(setFees)}
                                placeholder="0.00"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs" style={labelStyle}>Sale date *</label>
                            <input
                                type="date"
                                className={inputClass} style={inputStyle}
                                value={saleDate} onChange={e => setSaleDate(e.target.value)}
                            />
                        </div>
                    </div>

                    {netProceedsNum !== null && (
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            Net proceeds: <span style={{ color: 'var(--text-secondary)' }}>{fmtCcy(netProceedsNum, position.stockCcy)} {position.stockCcy}</span>
                            {isPartial && <span> &middot; Remaining: {(availableQty - qtyNum).toLocaleString()} {String(position.ticker)}</span>}
                        </p>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button
                            type="submit"
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
                            style={{ background: 'var(--pnl-red-dim)', color: 'var(--pnl-red)', border: '1px solid var(--pnl-red)' }}
                        >
                            <MdRemoveCircleOutline size={16} />
                            Record sale
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
