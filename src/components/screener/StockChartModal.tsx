'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import {
    Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { MdClose } from 'react-icons/md';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler);

const RANGES = ['6mo', '1y', '5y', 'max'] as const;
type Range = typeof RANGES[number];
type ChartType = 'line' | 'candle';

interface PricePoint { date: string; close: number; }
interface OHLCPoint { date: string; open: number; high: number; low: number; close: number; }

interface StockChartModalProps {
    symbol: string;
    name: string;
    currency?: string | null;
    onClose: () => void;
}

function CandleChart({ candles, currency, isDark }: { candles: OHLCPoint[]; currency: string | null; isDark: boolean }) {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current || candles.length === 0) return;

        let cancelled = false;
        let chartInstance: import('lightweight-charts').IChartApi | null = null;
        let ro: ResizeObserver | null = null;

        import('lightweight-charts').then(({ createChart, ColorType, CrosshairMode, CandlestickSeries }) => {
            if (cancelled || !containerRef.current) return;

            const grid = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
            const text = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)';

            chartInstance = createChart(containerRef.current, {
                layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: text },
                grid: { vertLines: { color: grid }, horzLines: { color: grid } },
                crosshair: { mode: CrosshairMode.Normal },
                rightPriceScale: { borderColor: 'transparent' },
                timeScale: { borderColor: 'transparent', timeVisible: false },
                width: containerRef.current.clientWidth,
                height: containerRef.current.clientHeight,
                handleScroll: true,
                handleScale: true,
            });

            const series = chartInstance.addSeries(CandlestickSeries, {
                upColor: '#16a34a',
                downColor: '#dc2626',
                borderUpColor: '#16a34a',
                borderDownColor: '#dc2626',
                wickUpColor: '#16a34a',
                wickDownColor: '#dc2626',
            });

            series.setData(candles.map(c => ({
                time: c.date as import('lightweight-charts').Time,
                open: c.open,
                high: c.high,
                low: c.low,
                close: c.close,
            })));

            if (currency) {
                series.applyOptions({
                    priceFormat: { type: 'custom', formatter: (p: number) => `${p.toLocaleString()} ${currency}` },
                });
            }

            chartInstance.timeScale().fitContent();

            ro = new ResizeObserver(() => {
                if (chartInstance && containerRef.current) {
                    chartInstance.applyOptions({
                        width: containerRef.current.clientWidth,
                        height: containerRef.current.clientHeight,
                    });
                }
            });
            ro.observe(containerRef.current);
        });

        return () => {
            cancelled = true;
            ro?.disconnect();
            chartInstance?.remove();
            chartInstance = null;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [candles, isDark]);

    return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}

export function StockChartModal({ symbol, name, currency = null, onClose }: StockChartModalProps) {
    const { resolvedTheme } = useTheme();
    const [range, setRange] = useState<Range>('1y');
    const [chartType, setChartType] = useState<ChartType>('candle');
    const [prices, setPrices] = useState<PricePoint[] | null>(null);
    const [candles, setCandles] = useState<OHLCPoint[] | null>(null);
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
                setPrices(data.prices ?? []);
                setCandles(data.candles ?? []);
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
    const up = prices && prices.length > 1 && prices[prices.length - 1].close >= prices[0].close;
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

                {/* Controls */}
                <div className="px-6 pt-4 flex items-center gap-3">
                    {/* Range toggle */}
                    <div className="inline-flex rounded-lg p-0.5 text-xs font-medium" style={{ background: 'var(--glass-bg)', border: '1px solid var(--border)' }}>
                        {RANGES.map(r => (
                            <button key={r} onClick={() => setRange(r)} className="px-3 py-1.5 rounded-md transition-all uppercase"
                                style={range === r ? { background: 'var(--accent-dim)', color: 'var(--accent)' } : { color: 'var(--text-secondary)' }}>
                                {r}
                            </button>
                        ))}
                    </div>

                    {/* Chart type toggle */}
                    <div className="inline-flex rounded-lg p-0.5 text-xs font-medium" style={{ background: 'var(--glass-bg)', border: '1px solid var(--border)' }}>
                        {(['candle', 'line'] as ChartType[]).map(t => (
                            <button key={t} onClick={() => setChartType(t)} className="px-3 py-1.5 rounded-md transition-all capitalize"
                                style={chartType === t ? { background: 'var(--accent-dim)', color: 'var(--accent)' } : { color: 'var(--text-secondary)' }}>
                                {t === 'candle' ? '🕯' : '📈'}
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
                    {state === 'ready' && chartType === 'candle' && candles && candles.length > 0 && (
                        <CandleChart candles={candles} currency={currency} isDark={isDark} />
                    )}
                    {state === 'ready' && chartType === 'candle' && (!candles || candles.length === 0) && (
                        <div className="h-full flex items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>
                            No candle data available
                        </div>
                    )}
                    {state === 'ready' && chartType === 'line' && prices && (
                        <Line
                            data={{
                                labels: prices.map(p => p.date),
                                datasets: [{
                                    data: prices.map(p => p.close),
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
