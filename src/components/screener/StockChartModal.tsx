'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import {
    Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { MdClose } from 'react-icons/md';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler);

const RANGES = ['6mo', '1y', '5y', 'max'] as const;
type Range = typeof RANGES[number];

interface PricePoint { date: string; close: number; }
interface StockChartModalProps {
    symbol: string;
    name: string;
    /** Listing currency, passed from the table row (already known there). */
    currency?: string | null;
    onClose: () => void;
}

/**
 * Lightweight on-the-fly price chart for a screener stock. Fetches from
 * /api/screener/history (no SQLite persistence) and renders a line chart.
 */
export function StockChartModal({ symbol, name, currency = null, onClose }: StockChartModalProps) {
    const { resolvedTheme } = useTheme();
    const [range, setRange] = useState<Range>('1y');
    const [points, setPoints] = useState<PricePoint[] | null>(null);
    const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

    useEffect(() => {
        let cancelled = false;
        setState('loading');
        (async () => {
            try {
                const res = await fetch(`/api/screener/history?symbol=${encodeURIComponent(symbol)}&range=${range}`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                if (cancelled) return;
                setPoints(data.prices ?? []);
                setState((data.prices?.length ?? 0) > 0 ? 'ready' : 'error');
            } catch {
                if (!cancelled) setState('error');
            }
        })();
        return () => { cancelled = true; };
    }, [symbol, range]);

    const isDark = resolvedTheme === 'dark';
    const grid = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    const tick = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)';
    const up = points && points.length > 1 && points[points.length - 1].close >= points[0].close;
    const line = up ? '#16a34a' : '#dc2626';

    return (
        <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                className="relative w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl flex flex-col"
                style={{ background: 'var(--surface-popover)', border: '1px solid var(--border-strong)', boxShadow: '0 24px 64px rgba(0,0,0,0.6)', maxHeight: '90dvh' }}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid var(--border)' }}>
                    <div className="min-w-0">
                        <a href={`https://finance.yahoo.com/quote/${symbol}`} target="_blank" rel="noopener noreferrer"
                            className="text-base font-semibold hover:opacity-70" style={{ color: 'var(--text-primary)' }}>
                            {symbol}
                        </a>
                        <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                            {name}{currency ? ` · ${currency}` : ''}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: 'var(--text-muted)' }} aria-label="Close">
                        <MdClose size={18} />
                    </button>
                </div>

                {/* Range toggle */}
                <div className="px-6 pt-4">
                    <div className="inline-flex rounded-lg p-0.5 text-xs font-medium" style={{ background: 'var(--glass-bg)', border: '1px solid var(--border)' }}>
                        {RANGES.map(r => (
                            <button key={r} onClick={() => setRange(r)} className="px-3 py-1.5 rounded-md transition-all uppercase"
                                style={range === r ? { background: 'var(--accent-dim)', color: 'var(--accent)' } : { color: 'var(--text-secondary)' }}>
                                {r}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Chart */}
                <div className="px-6 py-5" style={{ height: 360 }}>
                    {state === 'loading' && (
                        <div className="h-full flex items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</div>
                    )}
                    {state === 'error' && (
                        <div className="h-full flex items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>
                            No price data available
                        </div>
                    )}
                    {state === 'ready' && points && (
                        <Line
                            data={{
                                labels: points.map(p => p.date),
                                datasets: [{
                                    data: points.map(p => p.close),
                                    borderColor: line,
                                    backgroundColor: `${line}22`,
                                    borderWidth: 2,
                                    fill: true,
                                    pointRadius: 0,
                                    pointHoverRadius: 4,
                                    pointHoverBackgroundColor: line,
                                    tension: 0.15,
                                }],
                            }}
                            options={{
                                responsive: true,
                                maintainAspectRatio: false,
                                // Hover anywhere snaps to the nearest point (no need to hit it exactly).
                                interaction: { mode: 'index', intersect: false },
                                plugins: {
                                    legend: { display: false },
                                    tooltip: {
                                        displayColors: false,
                                        callbacks: {
                                            title: items => {
                                                const d = items[0]?.label;
                                                return d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
                                            },
                                            label: ctx => `${ctx.parsed.y?.toLocaleString()} ${currency ?? ''}`.trim(),
                                        },
                                    },
                                },
                                scales: {
                                    x: { grid: { color: grid }, ticks: { color: tick, maxTicksLimit: 6, autoSkip: true }, border: { display: false } },
                                    y: { grid: { color: grid }, ticks: { color: tick, maxTicksLimit: 6 }, border: { display: false } },
                                },
                            }}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
