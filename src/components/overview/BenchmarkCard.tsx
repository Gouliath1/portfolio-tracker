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
import { useTranslation } from '../../i18n';

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
    const { t } = useTranslation();
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

    // The fetch depends only on WHAT is needed (the date list and the currency),
    // not on the summary object. `summary` is rebuilt on most parent renders, and
    // keying the fetch on its identity re-requested the benchmark history 100+
    // times per page load — every one a serverless invocation. The replay maths
    // below re-runs on summary changes; the network does not.
    const datesKey = useMemo(() => neededDates.join(','), [neededDates]);
    const hasHistory = portfolioXirr !== null;

    const [series, setSeries] = useState<{ prices: Record<string, number>; rates: Record<string, number> } | null>(null);
    const [fetchState, setFetchState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

    useEffect(() => {
        if (!hasHistory || datesKey === '') return;
        let cancelled = false;
        setFetchState('loading');

        const fxPair = `USD${baseCurrency}`;

        Promise.all([
            fetch(`/api/historical-prices?symbol=${BENCHMARK_SYMBOL}&range=max`)
                .then(r => r.ok ? r.json() : null)
                .then(d => (d?.prices ?? {}) as Record<string, number>),
            baseCurrency === 'USD'
                ? Promise.resolve<Record<string, number>>({})
                : fetch(`/api/historical-fx-rates?pair=${fxPair}&dates=${encodeURIComponent(datesKey)}`)
                    .then(r => r.ok ? r.json() : null)
                    .then(d => (d?.rates ?? {}) as Record<string, number>),
        ]).then(([prices, rates]) => {
            if (cancelled) return;
            setSeries({ prices, rates });
            setFetchState('ready');
        }).catch(() => {
            if (!cancelled) setFetchState('error');
        });

        return () => { cancelled = true; };
    }, [hasHistory, baseCurrency, datesKey]);

    const benchmark = useMemo(() => {
        if (!series) return null;
        const priceMap = new Map(Object.entries(series.prices));
        const fxMap = new Map(Object.entries(series.rates));

        // Index price converted to the portfolio's base currency, forward-
        // filled so a flow on a non-trading day maps to the prior close.
        const indexPriceBaseOn = (date: string): number | null => {
            const px = forwardFillLookup(priceMap, date);
            if (px === null) return null;
            if (baseCurrency === 'USD') return px;
            const fx = forwardFillLookup(fxMap, date);
            return fx === null ? null : px * fx;
        };
        return calculateBenchmarkReplayXirr(summary, indexPriceBaseOn);
    }, [series, summary, baseCurrency]);

    const benchmarkXirr = benchmark?.return ?? null;
    const state: 'loading' | 'ready' | 'error' =
        fetchState === 'error' || (fetchState === 'ready' && benchmark === null) ? 'error'
        : fetchState === 'ready' ? 'ready'
        : 'loading';

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
        <Card title={t('overview.benchmark')}>
            {portfolioXirr === null ? (
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    {t('overview.benchmarkNoHistory')}
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
                                ? t('overview.benchmarkUnavailable', { benchmark: BENCHMARK_LABEL })
                                : t('overview.benchmarkExcess', { benchmark: BENCHMARK_LABEL })}
                        </p>
                    </div>
                    <div className="space-y-3">
                        <Bar
                            label={t('overview.portfolioXirr')}
                            value={`${portfolioXirr >= 0 ? '+' : ''}${portfolioXirr.toFixed(1)}%`}
                            pct={portfolioXirr} scaleMax={scaleMax} color="var(--accent)"
                        />
                        <Bar
                            label={t('overview.benchmarkXirr', { benchmark: BENCHMARK_LABEL })}
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
