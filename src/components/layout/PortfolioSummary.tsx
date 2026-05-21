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
            className="glass rounded-2xl p-4 sm:p-6 relative overflow-hidden transition-all duration-300 flex flex-col justify-between min-h-[100px] sm:min-h-[120px]"
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
                <div className="text-2xl sm:text-3xl font-semibold tabular-nums leading-none"
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
    const dailyPositive = dailyPnl === null ? null : dailyPnl.absoluteChange >= 0;
    const dailySign = dailyPnl && dailyPnl.absoluteChange >= 0 ? '+' : '';

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

            {/* 1 — Total Value (with cost as footnote) */}
            <StatCard
                label="Total Value"
                value={hasNullPrices
                    ? <span style={{ color: 'var(--text-muted)' }}>Updating…</span>
                    : formatValue(summary.totalValueJPY, showValues)}
                positive={hasNullPrices ? null : summary.totalValueJPY >= summary.totalCostJPY}
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
                positive={hasNullPrices || annualizedReturn === null ? null : annualizedReturn.return >= 0}
                flash={valueChanged}
            />

            {/* 3 — Total P&L card.
                Headline = unrealized (open lots, price-only) + all dividends
                           + realized sales (closed lots, price-only).
                Breakdown rows split that sum into three components, each
                stated as an amount only — no per-component %, which is what
                made the prior "realized %" misleading when open-lot dividends
                were divided by closed-lot cost. The headline % is the only %
                and uses deployed cost (open + closed) as denominator. */}
            {(() => {
                // realizedPnlJPY = closed-lot proceeds + closed-lot divs − cost.
                // Subtract closed-lot divs so the "Realized" row is sales-only
                // and the "Dividends" row owns *all* dividend income.
                const closedLotDividends = summary.closedPositions
                    .reduce((s, p) => s + (p.dividendIncomeJPY ?? 0), 0);

                const unrealized    = summary.totalPnlJPY;
                const dividends     = summary.totalDividendsJPY;
                const realizedSales = summary.realizedPnlJPY - closedLotDividends;

                const totalPnlAbsolute  = unrealized + dividends + realizedSales;
                const totalCostDeployed = summary.totalCostJPY + summary.realizedCostJPY;
                const totalPnlPct = totalCostDeployed === 0
                    ? 0
                    : (totalPnlAbsolute / totalCostDeployed) * 100;

                const rows: { label: string; amount: number }[] = [
                    { label: 'Unrealized', amount: unrealized },
                ];
                if (dividends !== 0) rows.push({ label: 'Dividends', amount: dividends });
                if (summary.closedPositions.length > 0) rows.push({ label: 'Realized (sales)', amount: realizedSales });

                const positive = hasNullPrices ? null : totalPnlAbsolute >= 0;
                const borderColor = positive === true ? 'var(--pnl-green)'
                    : positive === false ? 'var(--pnl-red)'
                    : 'var(--accent-glow)';
                const valueColor = positive === true ? 'var(--pnl-green)'
                    : positive === false ? 'var(--pnl-red)'
                    : 'var(--text-primary)';
                const glowBg = positive === true ? 'var(--pnl-green-dim)'
                    : positive === false ? 'var(--pnl-red-dim)'
                    : undefined;

                return (
                    <div
                        className="glass rounded-2xl p-4 sm:p-6 relative overflow-hidden transition-all duration-300 flex flex-col min-h-[100px] sm:min-h-[120px]"
                        style={{ border: `1px solid ${borderColor}` }}
                    >
                        {valueChanged && glowBg && (
                            <div className="absolute inset-0 rounded-2xl pointer-events-none transition-opacity duration-500"
                                style={{ background: glowBg, opacity: 0.4 }} />
                        )}
                        <div className="relative">
                            <p className="text-xs font-medium uppercase tracking-widest mb-3"
                                style={{ color: 'var(--text-muted)' }}>
                                Total P&L
                            </p>
                            <div className="text-2xl sm:text-3xl font-semibold tabular-nums leading-none"
                                style={{ color: valueColor }}>
                                {hasNullPrices
                                    ? <span style={{ color: 'var(--text-muted)' }}>Updating…</span>
                                    : <>
                                        {totalPnlAbsolute >= 0 ? '+' : ''}{formatValue(totalPnlAbsolute, showValues)}
                                        <span className="text-base sm:text-lg ml-2 font-medium" style={{ opacity: 0.7 }}>
                                            {totalPnlPct >= 0 ? '+' : ''}{totalPnlPct.toFixed(2)}%
                                        </span>
                                    </>
                                }
                            </div>
                            {!hasNullPrices && sinceLabel && (
                                <div className="mt-1.5 text-sm" style={{ color: valueColor, opacity: 0.75 }}>
                                    {sinceLabel}
                                </div>
                            )}
                            {!hasNullPrices && rows.length > 1 && (
                                <div className="mt-3 pt-3 space-y-1.5" style={{ borderTop: '1px solid var(--border)' }}>
                                    {rows.map(r => (
                                        <div key={r.label} className="flex justify-between items-baseline text-sm tabular-nums">
                                            <span style={{ color: 'var(--text-muted)' }}>{r.label}</span>
                                            <span style={{ color: r.amount >= 0 ? 'var(--pnl-green)' : 'var(--pnl-red)' }}>
                                                {r.amount >= 0 ? '+' : ''}{formatValue(r.amount, showValues)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })()}

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
