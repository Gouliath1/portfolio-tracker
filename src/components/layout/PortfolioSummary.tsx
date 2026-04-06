'use client';

import { useEffect, useRef } from 'react';
import { PortfolioSummary as PortfolioSummaryType } from '@portfolio/types';
import { calculatePortfolioCagrSinceInception } from '@portfolio/core';
import { useDailyPnl } from '../../hooks/useDailyPnl';

interface PortfolioSummaryProps {
    summary: PortfolioSummaryType;
    showValues: boolean;
    symbol: string;
    formatValue: (amount: number, showValues: boolean) => string;
}

const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });

interface StatCardProps {
    label: string;
    value: React.ReactNode;
    sub?: React.ReactNode;
    footnote?: React.ReactNode;
    positive?: boolean | null;
    flash?: boolean;
}

const StatCard = ({ label, value, sub, footnote, positive, flash }: StatCardProps) => {
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
            className="glass rounded-2xl p-6 relative overflow-hidden transition-all duration-300 flex flex-col justify-between min-h-[120px]"
            style={{ border: `1px solid ${borderColor}` }}
        >
            {flash && glowBg && (
                <div className="absolute inset-0 rounded-2xl pointer-events-none transition-opacity duration-500"
                    style={{ background: glowBg, opacity: 0.4 }} />
            )}
            <div className="relative flex-1">
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
            {footnote && (
                <div className="relative mt-3 pt-3 text-xs tabular-nums"
                    style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
                    {footnote}
                </div>
            )}
        </div>
    );
};

export const PortfolioSummary = ({ summary, showValues, formatValue }: PortfolioSummaryProps) => {
    const prevSummary = useRef<PortfolioSummaryType>(summary);
    const valueChanged = summary.totalValueJPY !== prevSummary.current.totalValueJPY;
    useEffect(() => { prevSummary.current = summary; }, [summary]);

    const hasNullPrices = summary.positions.some(p => p.currentPrice === null);
    const annualizedReturn = calculatePortfolioCagrSinceInception(summary);
    const dailyPnl = useDailyPnl(summary.positions, summary.totalValueJPY);

    // Earliest transaction date (shared by P&L and CAGR "since" label)
    const earliestDate = summary.positions.length > 0
        ? summary.positions.reduce((min, p) => (p.transactionDate < min ? p.transactionDate : min), summary.positions[0].transactionDate)
        : null;

    const sinceLabel = earliestDate
        ? `since ${formatDate(earliestDate.replace(/\//g, '-'))}`
        : null;

    // Daily P&L sign helpers
    const dailyPositive = dailyPnl === null ? null : dailyPnl.absoluteChange >= 0 ? true : false;
    const dailySign = dailyPnl && dailyPnl.absoluteChange >= 0 ? '+' : '';

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

            {/* 1 — Total Value (with cost as footnote) */}
            <StatCard
                label="Total Value"
                value={hasNullPrices
                    ? <span style={{ color: 'var(--text-muted)' }}>Updating…</span>
                    : formatValue(summary.totalValueJPY, showValues)}
                positive={hasNullPrices ? null : summary.totalValueJPY >= summary.totalCostJPY ? true : false}
                flash={valueChanged}
                footnote={
                    <span>Cost: {formatValue(summary.totalCostJPY, showValues)}</span>
                }
            />

            {/* 2 — Annualised Return */}
            <StatCard
                label="Annualised Return"
                value={
                    hasNullPrices
                        ? <span style={{ color: 'var(--text-muted)' }}>Updating…</span>
                        : annualizedReturn === null
                            ? <span className="text-lg" style={{ color: 'var(--text-muted)' }}>—</span>
                            : `${annualizedReturn.return >= 0 ? '+' : ''}${annualizedReturn.return.toFixed(2)}%`
                }
                sub={!hasNullPrices && annualizedReturn ? sinceLabel ?? undefined : undefined}
                positive={hasNullPrices || annualizedReturn === null ? null : annualizedReturn.return >= 0 ? true : false}
                flash={valueChanged}
            />

            {/* 3 — Total P&L (% headline, absolute + since as sub) */}
            <StatCard
                label="Total P&L"
                value={hasNullPrices
                    ? <span style={{ color: 'var(--text-muted)' }}>Updating…</span>
                    : `${summary.totalPnlPercentage >= 0 ? '+' : ''}${summary.totalPnlPercentage.toFixed(2)}%`}
                sub={!hasNullPrices
                    ? <>{formatValue(summary.totalPnlJPY, showValues)}{sinceLabel ? <span style={{ opacity: 0.6 }}> · {sinceLabel}</span> : null}</>
                    : undefined}
                positive={hasNullPrices ? null : summary.totalPnlJPY >= 0 ? true : false}
                flash={valueChanged}
            />

            {/* 4 — Daily P&L */}
            <StatCard
                label="Today's P&L"
                value={
                    hasNullPrices ? <span style={{ color: 'var(--text-muted)' }}>Updating…</span>
                    : dailyPnl === null ? <span className="text-lg" style={{ color: 'var(--text-muted)' }}>—</span>
                    : `${dailySign}${dailyPnl.percentageChange.toFixed(2)}%`
                }
                sub={dailyPnl && !hasNullPrices
                    ? `${dailySign}${formatValue(dailyPnl.absoluteChange, showValues)}`
                    : undefined}
                positive={hasNullPrices ? null : dailyPositive}
                flash={valueChanged}
            />
        </div>
    );
};
