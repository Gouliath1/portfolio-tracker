'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { loadPositions } from '../../../utils/positions';
import { calculatePortfolioSummary, calculatePortfolioAnnualizedReturn, calculatePositionXirr } from '@portfolio/core';
import { readCachedSummary, writeCachedSummary } from '../../../utils/pnlCache';
import { useBaseCurrency, SUPPORTED_BASE_CURRENCIES, BaseCurrency } from '../../../hooks/useBaseCurrency';
import type { PortfolioSummary } from '@portfolio/types';

// ── Date helpers ─────────────────────────────────────────────
const parseDate = (s: string) => new Date(s.replace(/\//g, '-'));
const fmtShort = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
const fmtLong  = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
const holdYrs  = (a: Date, b: Date) => (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24 * 365.25);

export default function DeepDivePage() {
    const [mounted, setMounted] = useState(false);
    const [summary, setSummary] = useState<PortfolioSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { currency, setCurrency, formatValue } = useBaseCurrency();

    useEffect(() => { setMounted(true); }, []);

    const loadData = useCallback(async (baseCurrency = currency) => {
        setLoading(true);
        setError(null);
        try {
            const positions = await loadPositions();
            const cached = readCachedSummary(positions, baseCurrency);
            if (cached) {
                setSummary(cached.summary);
                setLoading(false);
                return;
            }
            const s = await calculatePortfolioSummary(positions, false, baseCurrency);
            writeCachedSummary(positions, baseCurrency, s);
            setSummary(s);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load portfolio data');
        } finally {
            setLoading(false);
        }
    }, [currency]);

    useEffect(() => { loadData(); }, [loadData]);

    const handleCurrencyChange = (next: BaseCurrency) => {
        setCurrency(next);
        setSummary(null);
        loadData(next);
    };

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

    const today = new Date();
    const earliestDate = allPositions.length > 0
        ? allPositions.reduce<Date>((min, p) => {
              const d = parseDate(p.transactionDate);
              return d < min ? d : min;
          }, parseDate(allPositions[0].transactionDate))
        : null;
    const portfolioAge = earliestDate ? holdYrs(earliestDate, today) : null;

    if (!mounted) return null;

    return (
        <div style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', minHeight: '100vh' }}>

            {/* ── Header ─────────────────────────────────────────── */}
            <header className="sticky top-0 z-10 px-6 h-[52px] flex items-center justify-between gap-4"
                style={{ background: 'var(--surface-header)', borderBottom: '1px solid var(--border)' }}>
                <div className="flex items-center gap-4 min-w-0">
                    <Link href="/"
                        className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
                        style={{ background: 'var(--glass-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                        ← Dashboard
                    </Link>
                    <div className="min-w-0">
                        <h1 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                            Annualised Return — Deep Dive
                        </h1>
                        <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                            Read XIRR alongside the cash flows behind it.
                        </p>
                    </div>
                </div>

                {/* Currency selector */}
                <div className="flex-shrink-0 flex rounded-lg overflow-hidden"
                    style={{ border: '1px solid var(--border)' }}>
                    {SUPPORTED_BASE_CURRENCIES.map(c => (
                        <button key={c.code}
                            onClick={() => handleCurrencyChange(c.code)}
                            className="px-3 py-1.5 text-xs font-medium transition-colors"
                            style={{
                                background: currency === c.code ? 'var(--accent-dim)' : 'transparent',
                                color: currency === c.code ? 'var(--accent)' : 'var(--text-muted)',
                            }}>
                            {c.code}
                        </button>
                    ))}
                </div>
            </header>

            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">

                {/* Loading */}
                {loading && (
                    <div className="flex items-center justify-center py-24">
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
                    <>
                        {/* ── What is XIRR? ─────────────────────────────── */}
                        <div className="glass rounded-xl px-5 py-4 space-y-3 text-sm leading-relaxed"
                            style={{ border: '1px solid var(--border)' }}>
                            <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>What is XIRR?</p>
                            <p style={{ color: 'var(--text-secondary)' }}>
                                XIRR (extended internal rate of return) is the annualised return that ties together every cash flow in your portfolio — money you put in (each buy), money that came back out (each sale, each dividend), and the value still in the market today — placed on the actual dates they happened. It&apos;s the rate that makes the present value of everything balance to zero.
                            </p>
                            <p style={{ color: 'var(--text-secondary)' }}>
                                A portfolio you built up gradually has an XIRR that reflects when each contribution started earning, not just the size of the contribution. The same logic applies to a single position: a stock that doubled in 8 years has a far lower XIRR than one that doubled in 2, even though the percentage gain is identical. The <strong>Held</strong> column below shows each position&apos;s start → end window so you can read its XIRR in context.
                            </p>
                        </div>

                        {/* ── Headline reconciliation ───────────────────── */}
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-widest mb-3"
                                style={{ color: 'var(--text-muted)' }}>
                                Headline Reconciliation
                            </p>
                            <div className="flex gap-3 flex-wrap sm:flex-nowrap items-stretch">
                                {/* Portfolio XIRR card */}
                                <div className="flex-shrink-0 w-full sm:w-[160px] rounded-xl px-5 py-4 flex flex-col justify-between"
                                    style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-glow)' }}>
                                    <p className="text-[10px] font-semibold uppercase tracking-widest"
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
                                                since {fmtLong(earliestDate)} · {portfolioAge.toFixed(1)} yr
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Right side: stat grid + net gain */}
                                <div className="flex-1 min-w-0 flex flex-col gap-3">
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        {([
                                            { label: 'Total Invested', sub: 'open + closed cost', value: totalInvested },
                                            { label: 'Proceeds',       sub: 'from sales',          value: proceeds },
                                            { label: 'Dividends',      sub: 'all-time',             value: totalDividends },
                                            { label: 'Open Value',     sub: 'current',              value: openValue },
                                        ] as const).map(({ label, sub, value }) => (
                                            <div key={label} className="glass rounded-xl px-4 py-3"
                                                style={{ border: '1px solid var(--border)' }}>
                                                <p className="text-[10px] font-semibold uppercase tracking-widest"
                                                    style={{ color: 'var(--text-muted)' }}>
                                                    {label}
                                                </p>
                                                <p className="text-[9px] mb-2" style={{ color: 'var(--text-muted)', opacity: 0.65 }}>
                                                    {sub}
                                                </p>
                                                <p className="text-base font-semibold tabular-nums"
                                                    style={{ color: 'var(--text-primary)' }}>
                                                    {formatValue(value, true)}
                                                </p>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="glass rounded-xl px-4 py-3 flex items-center justify-between gap-4"
                                        style={{ border: '1px solid var(--border)' }}>
                                        <div>
                                            <p className="text-[10px] font-semibold uppercase tracking-widest"
                                                style={{ color: 'var(--text-muted)' }}>
                                                Net Gain
                                            </p>
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

                        {/* ── Per-position XIRR table ───────────────────── */}
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-widest mb-3"
                                style={{ color: 'var(--text-muted)' }}>
                                Per-Position Lifetime XIRR
                            </p>
                            <div className="glass rounded-xl overflow-auto"
                                style={{ border: '1px solid var(--border)' }}>
                                <table className="min-w-full">
                                    <thead className="sticky top-0"
                                        style={{ background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border)' }}>
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest"
                                                style={{ color: 'var(--text-muted)' }}>Position</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest"
                                                style={{ color: 'var(--text-muted)', width: 80 }}>Status</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest"
                                                style={{ color: 'var(--text-muted)', width: 140 }}>Held</th>
                                            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-widest"
                                                style={{ color: 'var(--text-muted)', width: 130 }}>Invested</th>
                                            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-widest"
                                                style={{ color: 'var(--text-muted)', width: 130 }}>Value</th>
                                            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-widest"
                                                style={{ color: 'var(--text-muted)', width: 110 }}>Dividends</th>
                                            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-widest"
                                                style={{ color: 'var(--accent)', width: 90 }}>↓ XIRR</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map(({ p, xirr }, i) => {
                                            const buyDate = parseDate(p.transactionDate);
                                            const endDate = p.status === 'closed' && p.saleDate
                                                ? parseDate(p.saleDate) : today;
                                            const held  = holdYrs(buyDate, endDate);
                                            const value = p.status === 'closed'
                                                ? (p.proceedsJPY ?? 0)
                                                : p.currentValueJPY;
                                            return (
                                                <tr key={i}
                                                    style={{
                                                        borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                                                        background: i % 2 === 0 ? 'transparent' : 'var(--glass-hover)',
                                                    }}>
                                                    <td className="px-4 py-3">
                                                        <p className="text-sm font-semibold"
                                                            style={{ color: 'var(--text-primary)' }}>
                                                            {String(p.ticker)}
                                                        </p>
                                                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                                            {p.account}
                                                        </p>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {p.status === 'closed' && (
                                                            <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium"
                                                                style={{
                                                                    background: 'var(--glass-hover)',
                                                                    color: 'var(--text-muted)',
                                                                    border: '1px solid var(--border)',
                                                                }}>
                                                                CLOSED
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <p className="text-sm tabular-nums"
                                                            style={{ color: 'var(--text-primary)' }}>
                                                            {held.toFixed(1)} yr
                                                        </p>
                                                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                                            {fmtShort(buyDate)} → {
                                                                p.status === 'closed' && p.saleDate
                                                                    ? fmtShort(parseDate(p.saleDate))
                                                                    : 'now'
                                                            }
                                                        </p>
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-sm tabular-nums"
                                                        style={{ color: 'var(--text-primary)' }}>
                                                        {formatValue(p.costInJPY, true)}
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-sm tabular-nums"
                                                        style={{ color: 'var(--text-primary)' }}>
                                                        {formatValue(value, true)}
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-sm tabular-nums"
                                                        style={{ color: 'var(--text-primary)' }}>
                                                        {formatValue(p.dividendIncomeJPY, true)}
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums"
                                                        style={{
                                                            color: xirr === null
                                                                ? 'var(--text-muted)'
                                                                : xirr >= 0 ? 'var(--pnl-green)' : 'var(--pnl-red)',
                                                        }}>
                                                        {xirr === null
                                                            ? '—'
                                                            : `${xirr >= 0 ? '+' : ''}${xirr.toFixed(2)}%`}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
