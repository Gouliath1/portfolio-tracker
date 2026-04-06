'use client';

import { useEffect, useRef } from 'react';
import { PortfolioSummary as PortfolioSummaryType } from '@portfolio/types';
import { calculatePortfolioCagrSinceInception } from '@portfolio/core';

interface PortfolioSummaryProps {
    summary: PortfolioSummaryType;
    showValues: boolean;
}

const hiddenValue = (value: number) => '•'.repeat(Math.min(8, Math.ceil(Math.log10(Math.abs(value) + 1))));

const formatJPY = (value: number) => `¥${Math.round(value).toLocaleString()}`;

const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
};

interface StatCardProps {
    label: string;
    value: React.ReactNode;
    sub?: React.ReactNode;
    positive?: boolean | null;
    flash?: boolean;
}

const StatCard = ({ label, value, sub, positive, flash }: StatCardProps) => {
    const borderColor = positive === true
        ? 'var(--pnl-green)'
        : positive === false
            ? 'var(--pnl-red)'
            : 'var(--accent-glow)';

    const valueColor = positive === true
        ? 'var(--pnl-green)'
        : positive === false
            ? 'var(--pnl-red)'
            : 'var(--text-primary)';

    const glowBg = positive === true
        ? 'var(--pnl-green-dim)'
        : positive === false
            ? 'var(--pnl-red-dim)'
            : undefined;

    return (
        <div
            className="glass rounded-2xl p-6 relative overflow-hidden transition-all duration-300"
            style={{ border: `1px solid ${borderColor}` }}
        >
            {/* Flash glow overlay */}
            {flash && glowBg && (
                <div
                    className="absolute inset-0 rounded-2xl pointer-events-none transition-opacity duration-500"
                    style={{ background: glowBg, opacity: 0.4 }}
                />
            )}
            <div className="relative">
                <p className="text-xs font-medium uppercase tracking-widest mb-3"
                    style={{ color: 'var(--text-muted)' }}>
                    {label}
                </p>
                <div className="text-3xl font-semibold tabular-nums leading-none"
                    style={{ color: valueColor }}>
                    {value}
                </div>
                {sub && (
                    <div className="mt-2 text-sm tabular-nums" style={{ color: valueColor, opacity: 0.75 }}>
                        {sub}
                    </div>
                )}
            </div>
        </div>
    );
};

export const PortfolioSummary = ({ summary, showValues }: PortfolioSummaryProps) => {
    const prevSummary = useRef<PortfolioSummaryType>(summary);
    const valueChanged = summary.totalValueJPY !== prevSummary.current.totalValueJPY;

    useEffect(() => { prevSummary.current = summary; }, [summary]);

    const hasNullPrices = summary.positions.some(p => p.currentPrice === null);
    const annualizedReturn = calculatePortfolioCagrSinceInception(summary);

    const displayValue = (v: number) => showValues ? formatJPY(v) : `¥${hiddenValue(v)}`;

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
                label="Total Value"
                value={hasNullPrices ? <span style={{ color: 'var(--text-muted)' }}>Updating…</span> : displayValue(summary.totalValueJPY)}
                positive={hasNullPrices ? null : summary.totalValueJPY >= summary.totalCostJPY ? true : false}
                flash={valueChanged}
            />
            <StatCard
                label="Total P&L"
                value={hasNullPrices ? <span style={{ color: 'var(--text-muted)' }}>Updating…</span> : displayValue(summary.totalPnlJPY)}
                sub={!hasNullPrices ? `${summary.totalPnlPercentage >= 0 ? '+' : ''}${summary.totalPnlPercentage.toFixed(2)}%` : undefined}
                positive={hasNullPrices ? null : summary.totalPnlJPY >= 0 ? true : false}
                flash={valueChanged}
            />
            <StatCard
                label="Total Cost"
                value={displayValue(summary.totalCostJPY)}
                positive={null}
            />
            <StatCard
                label="Annualised Return"
                value={
                    hasNullPrices
                        ? <span style={{ color: 'var(--text-muted)' }}>Updating…</span>
                        : annualizedReturn === null
                            ? <span className="text-lg" style={{ color: 'var(--text-muted)' }}>—</span>
                            : `${annualizedReturn.return.toFixed(2)}%`
                }
                sub={!hasNullPrices && annualizedReturn
                    ? `since ${formatDate(annualizedReturn.earliestDate)}`
                    : undefined}
                positive={hasNullPrices || annualizedReturn === null ? null : annualizedReturn.return >= 0 ? true : false}
                flash={valueChanged}
            />
        </div>
    );
};
