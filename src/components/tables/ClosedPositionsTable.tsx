'use client';

import { useState } from 'react';
import { Position } from '@portfolio/types';
import { formatCurrencyValue, getHiddenValue } from './positionsTable/currencyUtils';
import { MdHistory, MdExpandMore, MdExpandLess } from 'react-icons/md';

interface ClosedPositionsTableProps {
    positions: Position[];
    showValues: boolean;
    baseCurrency?: string;
    realizedPnlJPY: number;
    realizedCostJPY: number;
    realizedPnlPercentage: number;
}

export const ClosedPositionsTable = ({
    positions,
    showValues,
    baseCurrency = 'JPY',
    realizedPnlJPY,
    realizedCostJPY,
    realizedPnlPercentage,
}: ClosedPositionsTableProps) => {
    const [expanded, setExpanded] = useState(true);

    if (positions.length === 0) return null;

    const sign = realizedPnlJPY >= 0 ? '+' : '';
    const positive = realizedPnlJPY >= 0;

    return (
        <div className="glass rounded-2xl p-6 space-y-4">
            <button
                onClick={() => setExpanded(e => !e)}
                className="flex w-full items-center justify-between gap-3 text-left"
                aria-expanded={expanded}
            >
                <div className="flex items-center gap-3">
                    <MdHistory size={18} style={{ color: 'var(--text-muted)' }} />
                    <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                        Closed positions
                    </h2>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {positions.length} {positions.length === 1 ? 'lot' : 'lots'}
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    <div className="text-right">
                        <div className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                            Realized P&amp;L
                        </div>
                        <div
                            className="text-lg font-semibold tabular-nums"
                            style={{ color: positive ? 'var(--pnl-green)' : 'var(--pnl-red)' }}
                        >
                            {showValues
                                ? `${sign}${formatCurrencyValue(realizedPnlJPY, baseCurrency, true)} · ${sign}${realizedPnlPercentage.toFixed(2)}%`
                                : `${sign}${formatCurrencyValue(realizedPnlJPY, baseCurrency, false)}`}
                        </div>
                        {showValues && (
                            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                on {formatCurrencyValue(realizedCostJPY, baseCurrency, true)} cost
                            </div>
                        )}
                    </div>
                    {expanded ? <MdExpandLess size={20} style={{ color: 'var(--text-muted)' }} />
                              : <MdExpandMore size={20} style={{ color: 'var(--text-muted)' }} />}
                </div>
            </button>

            {expanded && (
                <div className="overflow-x-auto overscroll-none">
                    <table className="w-full tabular-nums">
                        <thead>
                            <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                                <th className="text-left text-xs font-semibold uppercase tracking-widest py-2 pr-3">Sold</th>
                                <th className="text-left text-xs font-semibold uppercase tracking-widest py-2 pr-3">Ticker</th>
                                <th className="text-left text-xs font-semibold uppercase tracking-widest py-2 pr-3">Name</th>
                                <th className="text-left text-xs font-semibold uppercase tracking-widest py-2 pr-3">Account</th>
                                <th className="text-right text-xs font-semibold uppercase tracking-widest py-2 pr-3">Qty</th>
                                <th className="text-right text-xs font-semibold uppercase tracking-widest py-2 pr-3">Cost/u</th>
                                <th className="text-right text-xs font-semibold uppercase tracking-widest py-2 pr-3">Sale/u</th>
                                <th className="text-right text-xs font-semibold uppercase tracking-widest py-2 pr-3">Cost</th>
                                <th className="text-right text-xs font-semibold uppercase tracking-widest py-2 pr-3">Proceeds</th>
                                <th className="text-right text-xs font-semibold uppercase tracking-widest py-2 pr-3">Realized P&amp;L</th>
                                <th className="text-right text-xs font-semibold uppercase tracking-widest py-2 pr-3">%</th>
                                <th className="text-right text-xs font-semibold uppercase tracking-widest py-2 pr-3">Total Dividends</th>
                                <th className="text-left text-xs font-semibold uppercase tracking-widest py-2 pr-3">Acquired</th>
                            </tr>
                        </thead>
                        <tbody>
                            {positions.map((p, i) => {
                                const realizedPnl = p.realizedPnlJPY ?? 0;
                                const realizedPct = p.realizedPnlPercentage ?? 0;
                                const proceeds = p.proceedsJPY ?? 0;
                                const isPos = realizedPnl >= 0;
                                return (
                                    <tr key={i} style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                                        <td className="text-xs sm:text-sm py-2 pr-3">{p.saleDate}</td>
                                        <td className="text-xs sm:text-sm py-2 pr-3" style={{ color: 'var(--text-primary)' }}>{String(p.ticker)}</td>
                                        <td className="text-xs sm:text-sm py-2 pr-3">{p.fullName}</td>
                                        <td className="text-xs sm:text-sm py-2 pr-3">{p.account}</td>
                                        <td className="text-xs sm:text-sm py-2 pr-3 text-right">
                                            {showValues ? p.quantity.toLocaleString() : getHiddenValue(p.quantity)}
                                        </td>
                                        <td className="text-xs sm:text-sm py-2 pr-3 text-right">
                                            {showValues ? p.costPerUnit.toFixed(4) : getHiddenValue(p.costPerUnit)}
                                        </td>
                                        <td className="text-xs sm:text-sm py-2 pr-3 text-right">
                                            {showValues ? (p.salePricePerUnit ?? 0).toFixed(4) : getHiddenValue(p.salePricePerUnit ?? 0)}
                                        </td>
                                        <td className="text-xs sm:text-sm py-2 pr-3 text-right">{formatCurrencyValue(p.costInJPY, baseCurrency, showValues)}</td>
                                        <td className="text-xs sm:text-sm py-2 pr-3 text-right">{formatCurrencyValue(proceeds, baseCurrency, showValues)}</td>
                                        <td className="text-xs sm:text-sm py-2 pr-3 text-right" style={{ color: isPos ? 'var(--pnl-green)' : 'var(--pnl-red)' }}>
                                            {formatCurrencyValue(realizedPnl, baseCurrency, showValues)}
                                        </td>
                                        <td className="text-xs sm:text-sm py-2 pr-3 text-right" style={{ color: isPos ? 'var(--pnl-green)' : 'var(--pnl-red)' }}>
                                            {showValues ? `${realizedPct >= 0 ? '+' : ''}${realizedPct.toFixed(2)}%` : getHiddenValue(realizedPct)}
                                        </td>
                                        <td className="text-xs sm:text-sm py-2 pr-3 text-right">
                                            {p.dividendIncomeJPY
                                                ? formatCurrencyValue(p.dividendIncomeJPY, baseCurrency, showValues)
                                                : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                                        </td>
                                        <td className="text-xs sm:text-sm py-2 pr-3">{p.transactionDate}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};
