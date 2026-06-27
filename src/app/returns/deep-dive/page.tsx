'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AppSidebar } from '../../../components/layout/AppSidebar';
import { SettingsPanel } from '../../../components/layout/SettingsPanel';
import { MdAccountBalanceWallet, MdSettings } from 'react-icons/md';
import { MobileBottomNav } from '../../../components/layout/MobileBottomNav';
import { calculatePortfolioAnnualizedReturn, calculatePositionXirr } from '@portfolio/core';
import { useBaseCurrency } from '../../../hooks/useBaseCurrency';
import { useActiveSetName } from '../../../hooks/useActiveSetName';
import { usePortfolioSummaryData } from '../../../hooks/usePortfolioSummaryData';

// ── Date helpers ─────────────────────────────────────────────
const parseDate = (s: string) => new Date(s.replace(/\//g, '-'));
const fmtShort = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
const fmtLong  = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const holdYrs  = (a: Date, b: Date) => (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24 * 365.25);

// ── Mini cash-flow table ─────────────────────────────────────
function MiniTable({
    title,
    rows,
    formatValue,
    outflow = false,
}: {
    title: string;
    rows: { date: Date | string; amount: number }[];
    formatValue: (n: number, show: boolean) => string;
    outflow?: boolean;
}) {
    return (
        <div className="flex-1 min-w-[160px]">
            <p className="text-xs font-semibold uppercase tracking-widest mb-2"
                style={{ color: 'var(--text-muted)' }}>
                {title}
            </p>
            <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                <table className="w-full">
                    <thead style={{ background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border)' }}>
                        <tr>
                            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-widest"
                                style={{ color: 'var(--text-muted)' }}>Date</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-widest"
                                style={{ color: 'var(--text-muted)' }}>Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, j) => {
                            const d = row.date instanceof Date ? row.date : parseDate(String(row.date));
                            const color = outflow ? 'var(--pnl-red)' : 'var(--pnl-green)';
                            return (
                                <tr key={j} style={{ borderTop: j === 0 ? 'none' : '1px solid var(--border)' }}>
                                    <td className="px-3 py-2 text-xs tabular-nums"
                                        style={{ color: 'var(--text-muted)' }}>
                                        {isNaN(d.getTime()) ? '—' : fmtLong(d)}
                                    </td>
                                    <td className="px-3 py-2 text-xs font-semibold tabular-nums text-right"
                                        style={{ color }}>
                                        {outflow ? '−' : '+'}{formatValue(Math.abs(row.amount), true)}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ── Page ─────────────────────────────────────────────────────
export default function DeepDivePage() {
    const [mounted, setMounted] = useState(false);
    const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
    const [priceHistory, setPriceHistory] = useState<Map<string, Record<string, number>>>(new Map());
    const [loadingPrices, setLoadingPrices] = useState(false);
    const [activeTab, setActiveTab] = useState<'lifetime' | 'annual'>('lifetime');
    const [xirrExpanded, setXirrExpanded] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const { currency, setCurrency, formatValue, hydrated: currencyHydrated } = useBaseCurrency();
    const activeSetName = useActiveSetName();
    const { summary, loading, error } = usePortfolioSummaryData(currency, currencyHydrated);
    const router = useRouter();

    useEffect(() => { setMounted(true); }, []);

    // Fetch historical prices for all tickers once summary is ready
    useEffect(() => {
        if (!summary) return;
        const tickers = [...new Set(
            [...summary.positions, ...summary.closedPositions].map(p => String(p.ticker))
        )];
        setLoadingPrices(true);
        Promise.all(
            tickers.map(async ticker => {
                try {
                    const res = await fetch(`/api/historical-prices?symbol=${encodeURIComponent(ticker)}&range=max`);
                    if (!res.ok) return { ticker, prices: {} as Record<string, number> };
                    const data = await res.json();
                    return { ticker, prices: (data.prices ?? {}) as Record<string, number> };
                } catch {
                    return { ticker, prices: {} as Record<string, number> };
                }
            })
        ).then(results => {
            const map = new Map<string, Record<string, number>>();
            results.forEach(({ ticker, prices }) => map.set(ticker, prices));
            setPriceHistory(map);
            setLoadingPrices(false);
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [summary?.positions.length, summary?.closedPositions.length]);

    // ── Derived ──────────────────────────────────────────────────
    const annualized = summary ? calculatePortfolioAnnualizedReturn(summary) : null;

    const allPositions = summary
        ? [...summary.positions, ...summary.closedPositions]
        : [];

    const rows = allPositions
        .map(p => ({ p, xirr: calculatePositionXirr(p) }))
        .sort((a, b) => {
            if (a.xirr === null && b.xirr === null) return 0;
            if (a.xirr === null) return 1;
            if (b.xirr === null) return -1;
            return b.xirr - a.xirr;
        });

    const totalInvested  = allPositions.reduce((s, p) => s + p.costInJPY, 0);
    const proceeds       = summary?.closedPositions.reduce((s, p) => s + (p.proceedsJPY ?? 0), 0) ?? 0;
    const totalDividends = allPositions.reduce((s, p) => s + p.dividendIncomeJPY, 0);
    const openValue      = summary?.totalValueJPY ?? 0;
    const netGain        = openValue + proceeds + totalDividends - totalInvested;

    // ── Per-position per-year price return ───────────────────────
    const today = new Date();
    const earliestDate = allPositions.length > 0
        ? allPositions.reduce<Date>((min, p) => {
              const d = parseDate(p.transactionDate);
              return d < min ? d : min;
          }, parseDate(allPositions[0].transactionDate))
        : null;
    const portfolioAge = earliestDate ? holdYrs(earliestDate, today) : null;

    const allYears = useMemo(() => {
        if (allPositions.length === 0) return [];
        const minYear = Math.min(...allPositions.map(p => parseDate(p.transactionDate).getFullYear()));
        const maxYear = today.getFullYear();
        return Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allPositions.length, today.getFullYear()]);

    const getYearReturn = useCallback((rowIdx: number, year: number): number | null => {
        const { p } = rows[rowIdx];
        const prices = priceHistory.get(String(p.ticker));
        if (!prices || Object.keys(prices).length === 0) return null;

        const buyDate = parseDate(p.transactionDate);
        const buyYear = buyDate.getFullYear();
        const endDate = p.status === 'closed' && p.saleDate ? parseDate(p.saleDate) : today;
        const endYear = endDate.getFullYear();

        if (year < buyYear || year > endYear) return null;

        const sorted = Object.keys(prices).sort();
        const lastPriceOnOrBefore = (d: Date): number | null => {
            const target = d.toISOString().split('T')[0];
            const candidates = sorted.filter(k => k <= target);
            return candidates.length ? prices[candidates[candidates.length - 1]] : null;
        };

        const startPrice = year === buyYear
            ? p.costPerUnit
            : lastPriceOnOrBefore(new Date(year - 1, 11, 31));

        const endPrice = (() => {
            if (year === endYear && p.status === 'closed' && p.salePricePerUnit) return p.salePricePerUnit;
            if (year === today.getFullYear()) return p.currentPrice;
            return lastPriceOnOrBefore(new Date(year, 11, 31));
        })();

        if (!startPrice || !endPrice || startPrice <= 0) return null;
        return ((endPrice - startPrice) / startPrice) * 100;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, priceHistory, today.getFullYear()]);

    if (!mounted) return null;

    return (
        <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-base)' }}>

            <AppSidebar activePage="deep-dive" currency={currency} activeSetName={activeSetName} />

            {/* ── Content column ───────────────────────────────── */}
            <div className="flex-1 min-w-0 md:ml-[200px] flex flex-col h-screen overflow-hidden">

                {/* ── Main content ─────────────────────────────── */}
                <main className="flex-1 min-h-0 pb-20 md:pb-0 overflow-hidden flex flex-col">
                    <div className="w-full max-w-screen-xl mx-auto px-3 sm:px-6 py-4 sm:py-6 flex-1 min-h-0 flex flex-col gap-4 sm:gap-6">

                        {/* Page header — scopes this page to returns so the broad
                            "Analysis" tab doesn't imply a full analysis suite. */}
                        <div className="flex-shrink-0">
                            <p className="text-xs font-semibold uppercase tracking-widest mb-1"
                                style={{ color: 'var(--text-muted)' }}>Analysis</p>
                            <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                                Returns
                            </h1>
                            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                                How your money has grown over time — annualised with XIRR, reconciled against every cash flow.
                            </p>
                        </div>

                        {loading && (
                            <div className="flex-1 min-h-0 flex items-center justify-center">
                                <span className="text-sm animate-pulse" style={{ color: 'var(--text-muted)' }}>Loading…</span>
                            </div>
                        )}

                        {error && (
                            <div className="rounded-xl px-4 py-3 text-sm"
                                style={{ background: 'var(--pnl-red-dim)', border: '1px solid var(--pnl-red)', color: 'var(--pnl-red)' }}>
                                {error}
                            </div>
                        )}

                        {!loading && summary && (
                            <div className="flex-1 min-h-0 flex flex-col gap-4 sm:gap-6">
                                {/* ── What is XIRR? ─────────────────────────────── */}
                                <div className="glass rounded-xl overflow-hidden flex-shrink-0">
                                    <button
                                        onClick={() => setXirrExpanded(v => !v)}
                                        className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold text-left"
                                        style={{ color: 'var(--text-primary)' }}
                                    >
                                        What is XIRR?
                                        <span style={{
                                            color: 'var(--text-muted)',
                                            display: 'inline-block',
                                            transform: xirrExpanded ? 'rotate(90deg)' : 'none',
                                            transition: 'transform 0.15s',
                                            fontSize: 18,
                                            lineHeight: 1,
                                        }}>›</span>
                                    </button>
                                    {xirrExpanded && (
                                        <div className="px-5 pb-4 space-y-3 text-sm leading-relaxed"
                                            style={{ borderTop: '1px solid var(--border)' }}>
                                            <p className="pt-3" style={{ color: 'var(--text-secondary)' }}>
                                                XIRR (extended internal rate of return) is the annualised return that ties together every cash flow — money you put in (each buy), money that came back out (each sale, each dividend), and the value still in the market today — placed on the actual dates they happened. It&apos;s the rate that makes the present value of everything balance to zero.
                                            </p>
                                            <p style={{ color: 'var(--text-secondary)' }}>
                                                A stock that doubled in 8 years has a far lower XIRR than one that doubled in 2, even though the percentage gain is identical. The <strong>Held</strong> column shows each position&apos;s window so you can read its XIRR in context.
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* ── Headline reconciliation ───────────────────── */}
                                <div className="flex-shrink-0">
                                    <p className="text-xs font-semibold uppercase tracking-widest mb-3"
                                        style={{ color: 'var(--text-muted)' }}>
                                        Headline Reconciliation
                                    </p>
                                    <div className="flex gap-3 flex-wrap sm:flex-nowrap items-stretch">
                                        <div className="flex-shrink-0 w-full sm:w-[160px] rounded-xl px-5 py-4 flex flex-col justify-between"
                                            style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-glow)' }}>
                                            <p className="text-xs font-semibold uppercase tracking-widest"
                                                style={{ color: 'var(--accent)' }}>
                                                Portfolio XIRR
                                            </p>
                                            <div className="mt-3">
                                                <div className="text-3xl font-semibold tabular-nums leading-none"
                                                    style={{ color: annualized && annualized.return >= 0 ? 'var(--pnl-green)' : 'var(--pnl-red)' }}>
                                                    {annualized
                                                        ? `${annualized.return >= 0 ? '+' : ''}${annualized.return.toFixed(2)}%`
                                                        : '—'}
                                                </div>
                                                {annualized && earliestDate && portfolioAge !== null && (
                                                    <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                                                        since {earliestDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} · {portfolioAge.toFixed(1)} yr
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex-1 min-w-0 flex flex-col gap-3">
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                                {([
                                                    { label: 'Total Invested', sub: 'open + closed cost', value: totalInvested },
                                                    { label: 'Proceeds',       sub: 'from sales',          value: proceeds },
                                                    { label: 'Dividends',      sub: 'all-time',             value: totalDividends },
                                                    { label: 'Open Value',     sub: 'current',              value: openValue },
                                                ] as const).map(({ label, sub, value }) => (
                                                    <div key={label} className="glass rounded-xl px-4 py-3">
                                                        <p className="text-xs font-semibold uppercase tracking-widest"
                                                            style={{ color: 'var(--text-muted)' }}>{label}</p>
                                                        <p className="text-[9px] mb-2" style={{ color: 'var(--text-muted)', opacity: 0.65 }}>{sub}</p>
                                                        <p className="text-base font-semibold tabular-nums"
                                                            style={{ color: 'var(--text-primary)' }}>
                                                            {formatValue(value, true)}
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="glass rounded-xl px-4 py-3 flex items-center justify-between gap-4">
                                                <div>
                                                    <p className="text-xs font-semibold uppercase tracking-widest"
                                                        style={{ color: 'var(--text-muted)' }}>Net Gain</p>
                                                    <p className="text-[9px]" style={{ color: 'var(--text-muted)', opacity: 0.65 }}>
                                                        open value + proceeds + dividends − total invested
                                                    </p>
                                                </div>
                                                <p className="text-xl font-semibold tabular-nums flex-shrink-0"
                                                    style={{ color: netGain >= 0 ? 'var(--pnl-green)' : 'var(--pnl-red)' }}>
                                                    {netGain >= 0 ? '+' : '−'}{formatValue(Math.abs(netGain), true)}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* ── Tab bar ──────────────────────────────────── */}
                                <div className="flex gap-1 rounded-xl p-1 flex-shrink-0"
                                    style={{ background: 'var(--glass-hover)', border: '1px solid var(--border)', width: 'fit-content' }}>
                                    {([
                                        { id: 'lifetime', label: 'Lifetime XIRR' },
                                        { id: 'annual',   label: 'Annual Returns' },
                                    ] as const).map(tab => (
                                        <button key={tab.id}
                                            onClick={() => setActiveTab(tab.id)}
                                            className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
                                            style={activeTab === tab.id
                                                ? { background: 'var(--surface)', color: 'var(--text-primary)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
                                                : { color: 'var(--text-muted)' }}>
                                            {tab.label}
                                        </button>
                                    ))}
                                </div>

                                {/* ── Per-position Lifetime XIRR table ─────────── */}
                                {activeTab === 'lifetime' && (
                                    <div className="flex-1 min-h-0 flex flex-col">
                                        <p className="text-xs font-semibold uppercase tracking-widest mb-3 flex-shrink-0"
                                            style={{ color: 'var(--text-muted)' }}>
                                            Returns by position
                                            <span className="ml-2 normal-case font-normal" style={{ opacity: 0.6 }}>
                                                — click a row to see its cash flows
                                            </span>
                                        </p>
                                        <div className="flex-1 min-h-0 glass rounded-xl overflow-auto overscroll-none">
                                            <table className="min-w-full data-table xirr-table">
                                                <thead className="sticky top-0 z-20"
                                                    style={{ background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border)' }}>
                                                    <tr>
                                                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest sticky left-0 z-30"
                                                            style={{ color: 'var(--text-muted)', width: 180, background: 'var(--table-header-bg)' }}>Position</th>
                                                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest whitespace-nowrap"
                                                            style={{ color: 'var(--text-muted)', width: 140 }}>Held</th>
                                                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-widest"
                                                            style={{ color: 'var(--text-muted)', width: 110 }}>Invested</th>
                                                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-widest"
                                                            style={{ color: 'var(--text-muted)', width: 110 }}>Value</th>
                                                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-widest"
                                                            style={{ color: 'var(--text-muted)', width: 110 }}>Dividends</th>
                                                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-widest"
                                                            style={{ color: 'var(--accent)', width: 110 }}>↓ XIRR</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {rows.map(({ p, xirr }, i) => {
                                                        const isExpanded = expandedIdx === i;
                                                        const buyDate    = parseDate(p.transactionDate);
                                                        const endDate    = p.status === 'closed' && p.saleDate ? parseDate(p.saleDate) : today;
                                                        const held       = holdYrs(buyDate, endDate);
                                                        const value      = p.status === 'closed' ? (p.proceedsJPY ?? 0) : p.currentValueJPY;

                                                        const dividendEvents = (p.dividendEvents ?? [])
                                                            .filter(ev => isFinite(ev.amountInBase) && ev.amountInBase !== 0)
                                                            .sort((a, b) => a.exDate.localeCompare(b.exDate));

                                                        return (
                                                            <React.Fragment key={i}>
                                                                <tr
                                                                    onClick={() => setExpandedIdx(isExpanded ? null : i)}
                                                                    className="cursor-pointer"
                                                                    style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}
                                                                >
                                                                    <td className="px-4 py-3 sticky left-0 z-10"
                                                                        style={{ background: 'var(--surface-popover)' }}>
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-xs flex-shrink-0"
                                                                                style={{
                                                                                    color: 'var(--text-muted)',
                                                                                    display: 'inline-block',
                                                                                    transform: isExpanded ? 'rotate(90deg)' : 'none',
                                                                                    transition: 'transform 0.15s',
                                                                                }}>
                                                                                ›
                                                                            </span>
                                                                            <div>
                                                                                <div className="flex items-center gap-1.5">
                                                                                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                                                                                        {String(p.ticker)}
                                                                                    </p>
                                                                                    {p.status === 'closed' && (
                                                                                        <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium"
                                                                                            style={{ background: 'var(--glass-hover)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                                                                                            CLOSED
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                                {p.fullName && (
                                                                                    <p className="text-xs leading-tight" style={{ color: 'var(--text-muted)' }}>
                                                                                        {p.fullName}
                                                                                    </p>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-4 py-3">
                                                                        <p className="text-sm tabular-nums whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                                                                            {held.toFixed(1)} yr
                                                                        </p>
                                                                        <p className="text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                                                                            {fmtShort(buyDate)} → {p.status === 'closed' && p.saleDate ? fmtShort(parseDate(p.saleDate)) : 'now'}
                                                                        </p>
                                                                    </td>
                                                                    <td className="px-4 py-3 text-right text-sm tabular-nums" style={{ color: 'var(--text-primary)' }}>
                                                                        {formatValue(p.costInJPY, true)}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-right text-sm tabular-nums" style={{ color: 'var(--text-primary)' }}>
                                                                        {formatValue(value, true)}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-right text-sm tabular-nums" style={{ color: 'var(--text-primary)' }}>
                                                                        {formatValue(p.dividendIncomeJPY, true)}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums"
                                                                        style={{ color: xirr === null ? 'var(--text-muted)' : xirr >= 0 ? 'var(--pnl-green)' : 'var(--pnl-red)' }}>
                                                                        {xirr === null ? '—' : `${xirr >= 0 ? '+' : ''}${xirr.toFixed(2)}%`}
                                                                    </td>
                                                                </tr>

                                                                {/* Expanded cash-flow drill-down */}
                                                                {isExpanded && (
                                                                    <tr style={{ borderTop: '1px solid var(--border)' }}>
                                                                        <td colSpan={6} className="px-4 py-4"
                                                                            style={{ background: 'var(--bg-base)' }}>
                                                                            <div className="flex gap-4 flex-wrap">
                                                                                <MiniTable
                                                                                    title="Purchase"
                                                                                    rows={[{ date: buyDate, amount: p.costInJPY }]}
                                                                                    formatValue={formatValue}
                                                                                    outflow
                                                                                />
                                                                                {dividendEvents.length > 0 && (
                                                                                    <MiniTable
                                                                                        title={`Dividends (${dividendEvents.length})`}
                                                                                        rows={dividendEvents.map(ev => ({
                                                                                            date: ev.exDate,
                                                                                            amount: ev.amountInBase,
                                                                                        }))}
                                                                                        formatValue={formatValue}
                                                                                    />
                                                                                )}
                                                                                <MiniTable
                                                                                    title={p.status === 'closed' ? 'Sale' : 'Still held'}
                                                                                    rows={[{
                                                                                        date: p.status === 'closed' && p.saleDate
                                                                                            ? parseDate(p.saleDate)
                                                                                            : today,
                                                                                        amount: value,
                                                                                    }]}
                                                                                    formatValue={formatValue}
                                                                                />
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                )}
                                                            </React.Fragment>
                                                        );
                                                    })}
                                                </tbody>
                                                <tfoot className="sticky bottom-0 z-20"
                                                    style={{ background: 'var(--table-header-bg)', borderTop: '1px solid var(--border)' }}>
                                                    <tr>
                                                        <td className="px-4 py-3 text-xs font-semibold uppercase tracking-widest sticky left-0 z-30"
                                                            style={{ color: 'var(--text-muted)', background: 'var(--table-header-bg)' }}>Total</td>
                                                        <td />{/* Held */}
                                                        <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums"
                                                            style={{ color: 'var(--text-primary)' }}>
                                                            {formatValue(totalInvested, true)}
                                                        </td>
                                                        <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums"
                                                            style={{ color: 'var(--text-primary)' }}>
                                                            {formatValue(openValue + proceeds, true)}
                                                        </td>
                                                        <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums"
                                                            style={{ color: 'var(--text-primary)' }}>
                                                            {formatValue(totalDividends, true)}
                                                        </td>
                                                        <td />{/* XIRR — not summable */}
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {/* ── Per-position per-year return ─────────────── */}
                                {activeTab === 'annual' && allYears.length > 0 && (
                                    <div className="flex-1 min-h-0 flex flex-col">
                                        <p className="text-xs font-semibold uppercase tracking-widest mb-3 flex-shrink-0"
                                            style={{ color: 'var(--text-muted)' }}>
                                            Per-Position Annual Returns
                                            <span className="ml-2 normal-case font-normal" style={{ opacity: 0.6 }}>
                                                — price return in native currency, partial years at buy/sale
                                            </span>
                                        </p>
                                        {loadingPrices ? (
                                            <p className="text-sm animate-pulse py-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                                                Loading price history…
                                            </p>
                                        ) : (
                                            <div className="flex-1 min-h-0 glass rounded-xl overflow-auto overscroll-none">
                                                <table className="min-w-full data-table xirr-table xirr-annual">
                                                    <thead style={{ background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border)' }}>
                                                        <tr>
                                                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest sticky left-0 z-10"
                                                                style={{ color: 'var(--text-muted)', background: 'var(--table-header-bg)' }}>
                                                                Position
                                                            </th>
                                                            {allYears.map(yr => (
                                                                <th key={yr}
                                                                    className="px-2 py-3 text-center text-xs font-semibold uppercase tracking-widest"
                                                                    style={{ color: 'var(--text-muted)', minWidth: 64 }}>
                                                                    {yr}
                                                                </th>
                                                            ))}
                                                            {/* Frozen XIRR column header */}
                                                            <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-widest sticky right-0 z-10"
                                                                style={{
                                                                    color: 'var(--accent)',
                                                                    background: 'var(--table-header-bg)',
                                                                    borderLeft: '1px solid var(--border)',
                                                                    minWidth: 72,
                                                                }}>
                                                                XIRR
                                                            </th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {rows.map(({ p, xirr }, i) => (
                                                                <tr key={i}
                                                                    style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                                                                    {/* Position label — sticky left */}
                                                                    <td className="px-4 py-2 sticky left-0 z-10"
                                                                        style={{ background: 'var(--surface-popover)' }}>
                                                                        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                                                                            {String(p.ticker)}
                                                                        </p>
                                                                        {p.fullName && (
                                                                            <p className="text-xs leading-tight" style={{ color: 'var(--text-muted)' }}>
                                                                                {p.fullName}
                                                                            </p>
                                                                        )}
                                                                    </td>
                                                                    {allYears.map(yr => {
                                                                        const ret = getYearReturn(i, yr);
                                                                        if (ret === null) {
                                                                            return <td key={yr} className="px-2 py-2 text-center" />;
                                                                        }
                                                                        const isPos = ret >= 0;
                                                                        return (
                                                                            <td key={yr} className="px-2 py-2 text-center"
                                                                                style={{
                                                                                    background: isPos ? 'var(--pnl-green-dim)' : 'var(--pnl-red-dim)',
                                                                                }}>
                                                                                <span className="text-xs font-semibold tabular-nums"
                                                                                    style={{ color: isPos ? 'var(--pnl-green)' : 'var(--pnl-red)' }}>
                                                                                    {isPos ? '+' : ''}{ret.toFixed(0)}%
                                                                                </span>
                                                                            </td>
                                                                        );
                                                                    })}
                                                                    {/* Frozen XIRR column */}
                                                                    <td className="px-3 py-2 text-center sticky right-0 z-10"
                                                                        style={{
                                                                            background: 'var(--surface-popover)',
                                                                            borderLeft: '1px solid var(--border)',
                                                                        }}>
                                                                        {xirr !== null ? (
                                                                            <span className="text-xs font-semibold tabular-nums"
                                                                                style={{ color: xirr >= 0 ? 'var(--pnl-green)' : 'var(--pnl-red)' }}>
                                                                                {xirr >= 0 ? '+' : ''}{xirr.toFixed(1)}%
                                                                            </span>
                                                                        ) : (
                                                                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>—</span>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </main>
            </div>

            <MobileBottomNav
                activePage="deep-dive"
                settingsOpen={settingsOpen}
                onSettingsToggle={() => setSettingsOpen(o => !o)}
            />

            <SettingsPanel
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                currency={currency}
                onCurrencyChange={setCurrency}
            />
        </div>
    );
}
