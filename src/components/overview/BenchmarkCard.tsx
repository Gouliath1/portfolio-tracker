'use client';

import { useEffect, useMemo, useState } from 'react';
import { PortfolioSummary } from '@portfolio/types';
import {
    calculatePortfolioAnnualizedReturn,
    calculateBenchmarkReplayXirr,
    forwardFillLookup,
} from '@portfolio/core';
import { BaseCurrency } from '../../hooks/useBaseCurrency';
import { Card } from './Card';

// MSCI ACWI (global all-cap equity), priced in USD. We replay the portfolio's
// exact cash flows into this index and compare money-weighted returns (XIRR vs
// XIRR), rather than against a flat rate. Note: Yahoo's series is price-return,
// so it excludes the index's own dividends and modestly understates ACWI.
const BENCHMARK_SYMBOL = 'ACWI';
const BENCHMARK_LABEL = 'MSCI ACWI';

interface BenchmarkCardProps {
    summary: PortfolioSummary;
    baseCurrency: BaseCurrency;
}

const Bar = ({ pct, scaleMax, color, label, value }: {
    pct: number; scaleMax: number; color: string; label: string; value: string;
}) => {
    const width = Math.max(2, (Math.max(0, pct) / scaleMax) * 100);
    return (
        <div>
            <div className="flex items-baseline justify-between mb-1">
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</span>
                <span className="text-sm font-semibold tabular-nums" style={{ color }}>{value}</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                <div className="h-full rounded-full" style={{ width: `${width}%`, background: color }} />
            </div>
        </div>
    );
};

// Normalize either YYYY/MM/DD or YYYY-MM-DD to YYYY-MM-DD.
const isoDay = (s: string) => s.replace(/\//g, '-').slice(0, 10);

export const BenchmarkCard = ({ summary, baseCurrency }: BenchmarkCardProps) => {
    const annualized = calculatePortfolioAnnualizedReturn(summary);
    const portfolioXirr = annualized?.return ?? null;

    // Every date the replay will price the index on: buy dates, sale dates,
    // dividend ex-dates, and today. Used to size both fetches.
    const neededDates = useMemo(() => {
        const ds = new Set<string>();
        for (const p of [...summary.positions, ...summary.closedPositions]) {
            if (p.transactionDate) ds.add(isoDay(p.transactionDate));
            if (p.saleDate) ds.add(isoDay(p.saleDate));
            p.dividendEvents?.forEach(ev => ds.add(isoDay(ev.exDate)));
        }
        ds.add(new Date().toISOString().slice(0, 10));
        return [...ds].sort();
    }, [summary]);

    const [benchmarkXirr, setBenchmarkXirr] = useState<number | null>(null);
    const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

    useEffect(() => {
        if (portfolioXirr === null || neededDates.length === 0) return;
        let cancelled = false;
        setState('loading');

        const fxPair = `USD${baseCurrency}`;
        const dates = neededDates.join(',');

        Promise.all([
            fetch(`/api/historical-prices?symbol=${BENCHMARK_SYMBOL}&range=max`)
                .then(r => r.ok ? r.json() : null)
                .then(d => (d?.prices ?? {}) as Record<string, number>),
            baseCurrency === 'USD'
                ? Promise.resolve<Record<string, number>>({})
                : fetch(`/api/historical-fx-rates?pair=${fxPair}&dates=${encodeURIComponent(dates)}`)
                    .then(r => r.ok ? r.json() : null)
                    .then(d => (d?.rates ?? {}) as Record<string, number>),
        ]).then(([prices, rates]) => {
            if (cancelled) return;
            const priceMap = new Map(Object.entries(prices));
            const fxMap = new Map(Object.entries(rates));

            // Index price converted to the portfolio's base currency, forward-
            // filled so a flow on a non-trading day maps to the prior close.
            const indexPriceBaseOn = (date: string): number | null => {
                const px = forwardFillLookup(priceMap, date);
                if (px === null) return null;
                if (baseCurrency === 'USD') return px;
                const fx = forwardFillLookup(fxMap, date);
                return fx === null ? null : px * fx;
            };

            const result = calculateBenchmarkReplayXirr(summary, indexPriceBaseOn);
            setBenchmarkXirr(result?.return ?? null);
            setState(result ? 'ready' : 'error');
        }).catch(() => {
            if (!cancelled) setState('error');
        });

        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [portfolioXirr, baseCurrency, neededDates]);

    const excess = portfolioXirr === null || benchmarkXirr === null
        ? null
        : portfolioXirr - benchmarkXirr;
    const excessColor = excess === null
        ? 'var(--text-muted)'
        : excess >= 0 ? 'var(--pnl-green)' : 'var(--pnl-red)';
    const scaleMax = Math.max(
        Math.abs(portfolioXirr ?? 0),
        Math.abs(benchmarkXirr ?? 0),
        1,
    );

    return (
        <Card title="Benchmark">
            {portfolioXirr === null ? (
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Not enough history to compute a return yet.
                </p>
            ) : (
                <div className="space-y-4">
                    <div>
                        {excess === null ? (
                            <p className="text-3xl font-semibold tabular-nums leading-none" style={{ color: 'var(--text-muted)' }}>
                                {state === 'error' ? '—' : '…'}
                            </p>
                        ) : (
                            <p className="text-3xl font-semibold tabular-nums leading-none" style={{ color: excessColor }}>
                                {excess >= 0 ? '+' : ''}{excess.toFixed(1)}%
                            </p>
                        )}
                        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                            {state === 'error'
                                ? `${BENCHMARK_LABEL} data unavailable`
                                : `Excess XIRR vs ${BENCHMARK_LABEL}`}
                        </p>
                    </div>
                    <div className="space-y-3">
                        <Bar
                            label="Portfolio XIRR"
                            value={`${portfolioXirr >= 0 ? '+' : ''}${portfolioXirr.toFixed(1)}%`}
                            pct={portfolioXirr} scaleMax={scaleMax} color="var(--accent)"
                        />
                        <Bar
                            label={`${BENCHMARK_LABEL} XIRR`}
                            value={benchmarkXirr === null
                                ? (state === 'error' ? '—' : '…')
                                : `${benchmarkXirr >= 0 ? '+' : ''}${benchmarkXirr.toFixed(1)}%`}
                            pct={benchmarkXirr ?? 0} scaleMax={scaleMax} color="var(--text-muted)"
                        />
                    </div>
                </div>
            )}
        </Card>
    );
};
