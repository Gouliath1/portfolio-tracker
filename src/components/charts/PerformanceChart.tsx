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

import { TimelineFilter, generateDateIntervals } from './performanceChart/chartUtils';
import { pnlAreaPlugin } from './performanceChart/pnlAreaPlugin';
import { createChartData } from './performanceChart/chartData';
import { createChartOptions } from './performanceChart/chartOptions';
import { createCustomTooltip } from './performanceChart/customTooltip';
import { TimelineFilterButtons } from './performanceChart/TimelineFilterButtons';
import { LoadingState, ErrorState, NoDataState } from './performanceChart/ChartStates';
import { useChartData } from './performanceChart/useChartData';

ChartJS.register(
    CategoryScale, LinearScale, PointElement, LineElement,
    Title, Tooltip, Legend, pnlAreaPlugin
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

    const { historicalData, isLoading, error } = useChartData(positions, selectedTimeline);
    const dateIntervals = generateDateIntervals(selectedTimeline, positions);
    const chartData = createChartData(dateIntervals, historicalData, positions, selectedTimeline, showValues, currency);

    const options = createChartOptions(showValues, selectedTimeline, symbol, currency);
    options.plugins!.tooltip = {
        enabled: false,
        external: createCustomTooltip(dateIntervals, historicalData, positions, selectedTimeline, showValues, symbol, currency),
    };

    const renderChart = () => {
        if (isLoading) return <LoadingState />;
        if (error) return <ErrorState error={error} />;
        if (dateIntervals.length === 0 || historicalData.length === 0) return <NoDataState />;
        return <Line data={chartData} options={options} />;
    };

    return (
        <div className="rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '20px 20px 16px' }}>
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Portfolio P&L Over Time
                </h2>
                <TimelineFilterButtons
                    selectedTimeline={selectedTimeline}
                    onTimelineChange={setSelectedTimeline}
                />
            </div>
            <div style={{ height: 'clamp(260px, 45vw, 420px)' }}>
                {renderChart()}
            </div>
            {showValues && (
                <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-sm mt-3"
                    style={{ color: 'var(--text-muted)' }}>
                    <span>
                        <span style={{ color: 'var(--chart-line1)', fontWeight: 600 }}>Left axis</span>
                        {' · '}
                        <span style={{ color: 'var(--chart-line1)' }}>Total Value</span>
                        {' + '}
                        <span style={{ color: 'var(--chart-line2)' }}>Total Cost</span>
                        {` (${currency})`}
                    </span>
                    <span aria-hidden="true">│</span>
                    <span>
                        <span style={{ color: 'var(--chart-line3)', fontWeight: 600 }}>Right axis</span>
                        {' · '}
                        <span style={{ color: 'var(--chart-line3)' }}>P&L</span>
                        {` (${currency}) — separate scale`}
                    </span>
                </div>
            )}
        </div>
    );
};
