'use client';

import { useState } from 'react';
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

import { TimelineFilter, generateDateIntervals } from './performanceChart/chartUtils';
import { valueBadgePlugin } from './performanceChart/valueBadgePlugin';
import { createChartData } from './performanceChart/chartData';
import { createChartOptions } from './performanceChart/chartOptions';
import { createCustomTooltip } from './performanceChart/customTooltip';
import { TimelineFilterButtons } from './performanceChart/TimelineFilterButtons';
import { ChartLegend } from './performanceChart/ChartLegend';
import { LoadingState, ErrorState, NoDataState } from './performanceChart/ChartStates';
import { useChartData } from './performanceChart/useChartData';

ChartJS.register(
    CategoryScale, LinearScale, PointElement, LineElement,
    Title, Tooltip, Legend, Filler, valueBadgePlugin
);

interface PerformanceChartProps {
    positions: Position[];
    showValues: boolean;
    currency?: string;
    symbol?: string;
}

export const PerformanceChart = ({ positions, showValues, currency = 'JPY', symbol = '¥' }: PerformanceChartProps) => {
    const [selectedTimeline, setSelectedTimeline] = useState<TimelineFilter>('All');
    useTheme();

    const { historicalData, isLoading, error } = useChartData(positions, selectedTimeline, currency);
    const dateIntervals = generateDateIntervals(selectedTimeline, positions);
    const chartData = createChartData(dateIntervals, historicalData, positions, selectedTimeline, showValues, currency);

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

    const options = createChartOptions(showValues, selectedTimeline, symbol, currency, yBounds);
    options.plugins!.tooltip = {
        enabled: false,
        external: createCustomTooltip(dateIntervals, historicalData, positions, selectedTimeline, showValues, symbol, currency),
    };
    // Config consumed by the latest-value pill badge plugin.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (options.plugins as any).valueBadges = { symbol, currency, showValues };

    const renderChart = () => {
        if (isLoading) return <LoadingState />;
        if (error) return <ErrorState error={error} />;
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
                    Portfolio P&amp;L Over Time
                </h2>
                <TimelineFilterButtons
                    selectedTimeline={selectedTimeline}
                    onTimelineChange={setSelectedTimeline}
                />
            </div>

            <ChartLegend showValues={showValues} />

            <div className="mt-4" style={{ height: 'clamp(260px, 45vw, 420px)' }}>
                {renderChart()}
            </div>
        </div>
    );
};
