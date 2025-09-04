'use client';

import { useState } from 'react';
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
import { Position } from '../types/portfolio';

// Chart utilities and components
import { TimelineFilter, generateDateIntervals } from './performanceChart/chartUtils';
import { pnlAreaPlugin } from './performanceChart/pnlAreaPlugin';
import { createChartData } from './performanceChart/chartData';
import { createChartOptions } from './performanceChart/chartOptions';
import { createCustomTooltip } from './performanceChart/customTooltip';
import { TimelineFilterButtons } from './performanceChart/TimelineFilterButtons';
import { LoadingState, ErrorState, NoDataState } from './performanceChart/ChartStates';
import { useChartData } from './performanceChart/useChartData';

// Register Chart.js components and plugins
ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    pnlAreaPlugin
);

interface PerformanceChartProps {
    positions: Position[];
    showValues: boolean;
}

export const PerformanceChart = ({ positions, showValues }: PerformanceChartProps) => {
    const [selectedTimeline, setSelectedTimeline] = useState<TimelineFilter>('All');
    
    const { historicalData, isLoading, error } = useChartData(positions, selectedTimeline);
    
    // Generate date intervals and chart data
    const dateIntervals = generateDateIntervals(selectedTimeline, positions);
    const chartData = createChartData(dateIntervals, historicalData, positions, selectedTimeline, showValues);
    
    // Create chart options with custom tooltip
    const options = createChartOptions(showValues, selectedTimeline);
    options.plugins!.tooltip = {
        enabled: false,
        external: createCustomTooltip(dateIntervals, historicalData, positions, selectedTimeline, showValues)
    };

    const renderChart = () => {
        if (isLoading) {
            return <LoadingState />;
        }
        
        if (error) {
            return <ErrorState error={error} />;
        }
        
        if (dateIntervals.length === 0 || historicalData.length === 0) {
            return <NoDataState />;
        }
        
        return <Line data={chartData} options={options} />;
    };

    return (
        <div className="w-full bg-white p-4 rounded-lg shadow">
            <TimelineFilterButtons
                selectedTimeline={selectedTimeline}
                onTimelineChange={setSelectedTimeline}
            />
            
            <div style={{ height: '450px' }}>
                {renderChart()}
            </div>
        </div>
    );
};
