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

// A two-half card. Visually parallel to StatCard but shows two distinct
// stats (e.g. unrealized + realized P&L) with their own labels, headlines
// and signs. Border color derives from the *top* half — the headline most
// users glance at first.
interface SplitHalfProps {
    label: string;
    headline: React.ReactNode;
    sub?: React.ReactNode;
    positive?: boolean | null;
}
interface SplitStatCardProps {
    top: SplitHalfProps;
    bottom?: SplitHalfProps;   // when undefined, falls back to single-half rendering
    flash?: boolean;
}

const halfValueColor = (positive?: boolean | null) =>
    positive === true ? 'var(--pnl-green)'
    : positive === false ? 'var(--pnl-red)'
    : 'var(--text-primary)';

const SplitStatCard = ({ top, bottom, flash }: SplitStatCardProps) => {
    // Border + glow follow the top headline since it's the primary stat.
    const borderColor = top.positive === true ? 'var(--pnl-green)'
        : top.positive === false ? 'var(--pnl-red)'
        : 'var(--accent-glow)';
    const glowBg = top.positive === true ? 'var(--pnl-green-dim)'
        : top.positive === false ? 'var(--pnl-red-dim)'
        : undefined;

    const renderHalf = (h: SplitHalfProps, isBottom = false) => {
        const valueColor = halfValueColor(h.positive);
        return (
            <div className={isBottom ? 'pt-3 mt-3' : ''}
                style={isBottom ? { borderTop: '1px solid var(--border)' } : undefined}
            >
                <p className="text-xs font-medium uppercase tracking-widest mb-2"
                    style={{ color: 'var(--text-muted)' }}>
                    {h.label}
                </p>
                <div className="text-xl sm:text-2xl font-semibold tabular-nums leading-none"
                    style={{ color: valueColor }}>
                    {h.headline}
                </div>
                {h.sub && (
                    <div className="mt-1.5 text-sm tabular-nums" style={{ color: valueColor, opacity: 0.75 }}>
                        {h.sub}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div
            className="glass rounded-2xl p-4 sm:p-6 relative overflow-hidden transition-all duration-300 flex flex-col min-h-[100px] sm:min-h-[120px]"
            style={{ border: `1px solid ${borderColor}` }}
        >
            {flash && glowBg && (
                <div className="absolute inset-0 rounded-2xl pointer-events-none transition-opacity duration-500"
                    style={{ background: glowBg, opacity: 0.4 }} />
            )}
            <div className="relative">
                {renderHalf(top)}
                {bottom && renderHalf(bottom, true)}
            </div>
        </div>
    );
};

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
                Top: Total P&L = unrealized (open lots, capital gains)
                                 + realized (closed lots, proceeds + their dividends − cost)
                                 + dividends earned on still-open lots.
                     Denominator for % is total capital ever deployed
                     (open cost + closed cost) so realized cost basis isn't
                     dropped after a sale.
                Bottom: Realized-only breakdown so the user can see how much
                        of the total is locked in vs still on paper. Marked
                        as including dividends and sales when both apply. */}
            {(() => {
                // Closed-lot dividends are already inside realizedPnlJPY.
                // Subtracting them from totalDividendsJPY gives the income
                // earned on still-open positions, which isn't in any P&L
                // figure yet but is real money.
                const closedLotDividends = summary.closedPositions
                    .reduce((s, p) => s + (p.dividendIncomeJPY ?? 0), 0);
                const openLotDividends = summary.totalDividendsJPY - closedLotDividends;

                const totalPnlAbsolute = summary.totalPnlJPY + summary.realizedPnlJPY + openLotDividends;
                const totalCostDeployed = summary.totalCostJPY + summary.realizedCostJPY;
                const totalPnlPct = totalCostDeployed === 0
                    ? 0
                    : (totalPnlAbsolute / totalCostDeployed) * 100;

                const hasRealizedSection = summary.closedPositions.length > 0 || summary.totalDividendsJPY > 0;

                // Label the realized breakdown by what's actually in it.
                let realizedLabel = 'Realized';
                if (summary.closedPositions.length > 0 && summary.totalDividendsJPY > 0) {
                    realizedLabel = 'Realized (sales + dividends)';
                } else if (summary.totalDividendsJPY > 0 && summary.closedPositions.length === 0) {
                    realizedLabel = 'Realized (dividends only)';
                }

                // The realized half blends two numbers we already track:
                // realizedPnlJPY (closed lots: proceeds + closed-lot divs − cost)
                // and openLotDividends (income on still-held lots). They're
                // both "money in pocket", so we surface their sum here.
                const realizedTotal = summary.realizedPnlJPY + openLotDividends;
                const realizedDenominator = summary.realizedCostJPY > 0
                    ? summary.realizedCostJPY
                    : (summary.totalCostJPY > 0 ? summary.totalCostJPY : 0);
                const realizedPct = realizedDenominator === 0
                    ? 0
                    : (realizedTotal / realizedDenominator) * 100;

                return (
                    <SplitStatCard
                        flash={valueChanged}
                        top={{
                            label: 'Total P&L',
                            headline: hasNullPrices
                                ? <span style={{ color: 'var(--text-muted)' }}>Updating…</span>
                                : `${totalPnlPct >= 0 ? '+' : ''}${totalPnlPct.toFixed(2)}%`,
                            sub: !hasNullPrices
                                ? <>{totalPnlAbsolute >= 0 ? '+' : ''}{formatValue(totalPnlAbsolute, showValues)}{sinceLabel ? <span style={{ opacity: 0.6 }}> · {sinceLabel}</span> : null}</>
                                : undefined,
                            positive: hasNullPrices ? null : totalPnlAbsolute >= 0,
                        }}
                        bottom={hasRealizedSection ? {
                            label: realizedLabel,
                            headline: `${realizedPct >= 0 ? '+' : ''}${realizedPct.toFixed(2)}%`,
                            sub: <>{realizedTotal >= 0 ? '+' : ''}{formatValue(realizedTotal, showValues)}</>,
                            positive: realizedTotal >= 0,
                        } : undefined}
                    />
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
