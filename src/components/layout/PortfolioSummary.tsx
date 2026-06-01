'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { MdInfoOutline } from 'react-icons/md';
import { PortfolioSummary as PortfolioSummaryType } from '@portfolio/types';
import { calculatePortfolioAnnualizedReturn } from '@portfolio/core';
import { useDailyPnl } from '../../hooks/useDailyPnl';

interface PortfolioSummaryProps {
    summary: PortfolioSummaryType;
    showValues: boolean;
    symbol: string;
    formatValue: (amount: number, showValues: boolean) => string;
    isLoading?: boolean;
}

const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });

const InfoTooltip = ({ text }: { text: string }) => {
    const [open, setOpen] = useState(false);
    const btnRef = useRef<HTMLButtonElement>(null);
    const [tipRect, setTipRect] = useState<DOMRect | null>(null);

    useEffect(() => {
        if (!open || !btnRef.current) return;
        setTipRect(btnRef.current.getBoundingClientRect());
        const close = (e: MouseEvent) => {
            if (btnRef.current && !btnRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [open]);

    return (
        <span className="relative inline-flex items-center">
            <button
                ref={btnRef}
                type="button"
                onClick={() => setOpen(prev => !prev)}
                className="p-0.5 rounded transition-colors hover:opacity-100 focus:outline-none focus:ring-1 focus:ring-[var(--accent-glow)]"
                style={{ color: 'var(--text-muted)', opacity: 0.6 }}
                aria-label="What is this?"
            >
                <MdInfoOutline size={14} />
            </button>
            {open && tipRect && createPortal(
                <div style={{
                    position: 'fixed',
                    top: tipRect.bottom + 8,
                    right: Math.max(8, window.innerWidth - tipRect.right),
                    width: 288,
                    zIndex: 9999,
                    borderRadius: '0.75rem',
                    padding: '0.5rem 0.75rem',
                    fontSize: '0.75rem',
                    lineHeight: '1.6',
                    color: 'var(--text-primary)',
                    background: 'var(--surface-popover)',
                    border: '1px solid var(--border)',
                    boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
                }}>
                    {text}
                </div>,
                document.body
            )}
        </span>
    );
};

interface StatCardProps {
    label: string;
    info?: string;
    value: React.ReactNode;
    sub?: React.ReactNode;
    footnote?: React.ReactNode;
    positive?: boolean | null;
    flash?: boolean;
    instant?: boolean;
}

const StatCard = ({ label, info, value, sub, footnote, positive, flash, instant }: StatCardProps) => {
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
            className={`glass rounded-xl p-4 sm:p-5 relative ${instant ? '' : 'transition-all duration-300'} flex flex-col justify-between min-h-[100px] sm:min-h-[116px]`}
        >
            {flash && glowBg && (
                <div className="absolute inset-0 rounded-2xl pointer-events-none transition-opacity duration-500"
                    style={{ background: glowBg, opacity: 0.4 }} />
            )}
            <div className="relative flex-1">
                <div className="flex items-start justify-between gap-2 mb-3">
                    <p className="text-xs font-medium uppercase tracking-widest"
                        style={{ color: 'var(--text-muted)' }}>
                        {label}
                    </p>
                    {info && <InfoTooltip text={info} />}
                </div>
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

export const PortfolioSummary = ({ summary, showValues, formatValue, isLoading }: PortfolioSummaryProps) => {
    const prevSummary = useRef<PortfolioSummaryType>(summary);
    const valueChanged = summary.totalValueJPY !== prevSummary.current.totalValueJPY;
    useEffect(() => { prevSummary.current = summary; }, [summary]);

    const wasLoadingRef = useRef(isLoading ?? false);
    const isFirstDataRender = wasLoadingRef.current && !isLoading;
    useEffect(() => { wasLoadingRef.current = isLoading ?? false; }, [isLoading]);

    const hasNullPrices = isLoading || summary.positions.some(p => p.currentPrice === null);
    const annualizedReturn = calculatePortfolioAnnualizedReturn(summary);
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

    // Total P&L = unrealized (open lots, price-only) + all dividends
    //             + realized sales (closed lots, price-only).
    // realizedPnlJPY already folds in closed-lot dividends, so subtract them
    // so the "Realized" component is sales-only and "Dividends" owns *all*
    // dividend income. Headline % uses deployed cost (open + closed) so the
    // realized cost basis isn't dropped after a sale.
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
    const totalPnlPositive = hasNullPrices ? null : totalPnlAbsolute >= 0;

    // Breakdown chips show only when there's more than just unrealized to
    // report — otherwise the headline already says everything.
    const breakdown: { label: string; amount: number }[] = [
        { label: 'Unrealized', amount: unrealized },
    ];
    if (dividends !== 0) breakdown.push({ label: 'Dividends', amount: dividends });
    if (summary.closedPositions.length > 0) breakdown.push({ label: 'Realized (sales)', amount: realizedSales });
    const showBreakdown = !hasNullPrices && breakdown.length > 1;

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

                {/* 1 — Total Value (with cost as footnote) */}
                <StatCard
                    label="Total Value"
                    info="Current market value of all open positions, converted into your base currency at today's FX rate. The 'Cost' line shows what you originally paid for those same positions (excludes closed lots)."
                    value={hasNullPrices
                        ? <span style={{ color: 'var(--text-muted)' }}>Updating…</span>
                        : formatValue(summary.totalValueJPY, showValues)}
                    positive={hasNullPrices ? null : summary.totalValueJPY >= summary.totalCostJPY}
                    flash={valueChanged}
                    instant={isFirstDataRender}
                    footnote={
                        <span>Cost: {formatValue(summary.totalCostJPY, showValues)}</span>
                    }
                />

                {/* 2 — Annualised Return */}
                <StatCard
                    label="Annualised Return"
                    info="Money-weighted annualised return (XIRR). Each purchase is a cash outflow on its transaction date; each sale and each dividend is a cash inflow on its date; today's open-position value is the terminal inflow — solving for the rate that makes the present value of those cash flows zero."
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
                    instant={isFirstDataRender}
                    footnote={
                        <Link href="/returns/deep-dive"
                            className="transition-opacity hover:opacity-100"
                            style={{ color: 'var(--accent)', opacity: 0.8 }}>
                            Deep Dive →
                        </Link>
                    }
                />

                {/* 3 — Total P&L headline.
                    Amount is the primary stat; "% · since X" sits on the
                    sub-line so the headline never wraps. Component
                    breakdown lives in the secondary row below. */}
                <StatCard
                    label="Total P&L"
                    info="Lifetime profit/loss across everything you've owned: unrealised mark-to-market on open lots + all dividends received + realised gains from past sales. The percentage divides this by your total deployed cost (open cost + closed cost)."
                    value={hasNullPrices
                        ? <span style={{ color: 'var(--text-muted)' }}>Updating…</span>
                        : <>{totalPnlAbsolute >= 0 ? '+' : ''}{formatValue(totalPnlAbsolute, showValues)}</>}
                    sub={!hasNullPrices
                        ? <>
                            {totalPnlPct >= 0 ? '+' : ''}{totalPnlPct.toFixed(2)}%
                            {sinceLabel && <span style={{ opacity: 0.7 }}> · {sinceLabel}</span>}
                        </>
                        : undefined}
                    positive={totalPnlPositive}
                    flash={valueChanged}
                    instant={isFirstDataRender}
                />

                {/* 4 — Daily P&L */}
                <StatCard
                    label="Today's P&L"
                    info="Change in total portfolio value since the previous trading-day's close, in your base currency. Percentage is that change divided by yesterday's closing value."
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
                    instant={isFirstDataRender}
                />
            </div>

            {/* Total P&L breakdown — subordinate row, only shown when the
                headline is composed of more than one component. Lighter
                visual weight (smaller text, dim border) makes the
                hierarchy clear: top row = KPIs, bottom row = explainer. */}
            {showBreakdown && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {breakdown.map(r => {
                        const color = r.amount >= 0 ? 'var(--pnl-green)' : 'var(--pnl-red)';
                        return (
                            <div key={r.label}
                                className="glass rounded-xl px-4 py-3 flex items-baseline justify-between"
                                style={{ border: '1px solid var(--border)' }}
                            >
                                <span className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                                    {r.label}
                                </span>
                                <span className="text-base sm:text-lg font-semibold tabular-nums" style={{ color }}>
                                    {r.amount >= 0 ? '+' : ''}{formatValue(r.amount, showValues)}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
