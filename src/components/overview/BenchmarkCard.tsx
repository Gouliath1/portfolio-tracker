'use client';

import { PortfolioSummary } from '@portfolio/types';
import { calculatePortfolioAnnualizedReturn } from '@portfolio/core';
import { Card } from './Card';

const BENCHMARK_PCT = 5.0;

interface BenchmarkCardProps {
    summary: PortfolioSummary;
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

export const BenchmarkCard = ({ summary }: BenchmarkCardProps) => {
    const annualized = calculatePortfolioAnnualizedReturn(summary);
    const cagr = annualized?.return ?? null;

    const excess = cagr === null ? null : cagr - BENCHMARK_PCT;
    const excessColor = excess === null
        ? 'var(--text-muted)'
        : excess >= 0 ? 'var(--pnl-green)' : 'var(--pnl-red)';
    const scaleMax = Math.max(Math.abs(cagr ?? 0), BENCHMARK_PCT, 1);

    return (
        <Card title="Benchmark">
            {cagr === null ? (
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Not enough history to compute a return yet.
                </p>
            ) : (
                <div className="space-y-4">
                    <div>
                        <p className="text-3xl font-semibold tabular-nums leading-none" style={{ color: excessColor }}>
                            {excess! >= 0 ? '+' : ''}{excess!.toFixed(1)}%
                        </p>
                        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                            Excess return vs {BENCHMARK_PCT.toFixed(0)}% p.a. benchmark
                        </p>
                    </div>
                    <div className="space-y-3">
                        <Bar
                            label="Portfolio CAGR" value={`${cagr >= 0 ? '+' : ''}${cagr.toFixed(1)}%`}
                            pct={cagr} scaleMax={scaleMax} color="var(--accent)"
                        />
                        <Bar
                            label="Benchmark" value={`${BENCHMARK_PCT.toFixed(1)}%`}
                            pct={BENCHMARK_PCT} scaleMax={scaleMax} color="var(--text-muted)"
                        />
                    </div>
                </div>
            )}
        </Card>
    );
};
