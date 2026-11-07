'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Position } from '@portfolio/types';

import { Filler } from 'chart.js';

import type { TimelineSelection } from './performanceChart/chartUtils';
import { valueBadgePlugin } from './performanceChart/valueBadgePlugin';
import { createChartData } from './performanceChart/chartData';
import { createChartOptions } from './performanceChart/chartOptions';
import { createCustomTooltip } from './performanceChart/customTooltip';
import { TimelineFilterButtons } from './performanceChart/TimelineFilterButtons';
import { ChartLegend } from './performanceChart/ChartLegend';
import { LoadingState, ErrorState, NoDataState } from './performanceChart/ChartStates';
import { useChartData } from './performanceChart/useChartData';
import { useTranslation } from '../../i18n';

ChartJS.register(
    CategoryScale, LinearScale, PointElement, LineElement,
    Title, Tooltip, Legend, Filler, valueBadgePlugin
);

/** Stand-in while no period resolves; the chart renders its empty state then. */
const EMPTY_WINDOW = { from: new Date(0), to: new Date(0) };

interface PerformanceChartProps {
    positions: Position[];
    showValues: boolean;
    currency?: string;
    symbol?: string;
}

export const PerformanceChart = ({ positions, showValues, currency = 'JPY', symbol = '¥' }: PerformanceChartProps) => {
    const [selection, setSelection] = useState<TimelineSelection>({ timeline: 'All' });
    const { t, locale } = useTranslation();
    useTheme();

    // The custom tooltip lives on document.body, so it can outlive the chart when
    // the user switches menus. Remove it on unmount so it doesn't linger.
    useEffect(() => {
        return () => {
            document.getElementById('chartjs-tooltip')?.remove();
        };
    }, []);

    const { dateWindow, dateIntervals, historicalData, isLoading, error } = useChartData(positions, selection, currency);
    const chartData = createChartData(dateIntervals, historicalData, positions, dateWindow ?? EMPTY_WINDOW, showValues, currency, t, locale);

    // Frame the y-axis to the actual data range, padded by 10% top and bottom.
    const yValues = chartData.datasets
        .filter((d) => !d.hidden)
        .flatMap((d) => d.data)
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    let yBounds: { min: number; max: number } | undefined;
    if (yValues.length > 0) {
        const dataMin = Math.min(...yValues);
        const dataMax = Math.max(...yValues);
        const pad = (dataMax - dataMin) * 0.1 || Math.abs(dataMax) * 0.1 || 1;
        yBounds = { min: dataMin - pad, max: dataMax + pad };
    }

    const options = createChartOptions(showValues, symbol, currency, yBounds, locale);
    options.plugins!.tooltip = {
        enabled: false,
        external: createCustomTooltip(dateIntervals, historicalData, positions, dateWindow ?? EMPTY_WINDOW, showValues, symbol, currency, t, locale),
    };
    // Config consumed by the latest-value pill badge plugin.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (options.plugins as any).valueBadges = { symbol, currency, showValues };

    const renderChart = () => {
        if (isLoading) return <LoadingState />;
        if (error) return <ErrorState error={t(error)} />;
        if (dateIntervals.length === 0 || historicalData.length === 0) return <NoDataState />;
        return <Line data={chartData} options={options} />;
    };

    return (
        <div
            className="rounded-2xl"
            style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 8px 24px rgba(16,24,40,0.06)',
                padding: '24px',
            }}
        >
            <div className="flex items-start justify-between flex-wrap gap-3 mb-1">
                <h2
                    className="font-semibold"
                    style={{ color: 'var(--text-primary)', fontSize: '20px', letterSpacing: '-0.01em' }}
                >
                    {t('chart.title')}
                </h2>
                <TimelineFilterButtons selection={selection} onSelectionChange={setSelection} />
            </div>

            <ChartLegend showValues={showValues} />

            <div className="mt-4" style={{ height: 'clamp(260px, 45vw, 420px)' }}>
                {renderChart()}
            </div>
        </div>
    );
};
