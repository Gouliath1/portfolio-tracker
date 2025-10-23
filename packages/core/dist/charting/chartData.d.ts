import { Position } from '@portfolio/types';
import { HistoricalSnapshot } from '../historicalPortfolioCalculations';
import { TimelineFilter } from './chartUtils';
export interface ChartData {
    labels: string[];
    datasets: Array<{
        label: string;
        data: number[];
        borderColor: string;
        backgroundColor: string;
        tension: number;
        fill: boolean;
        hidden: boolean;
        yAxisID?: string;
        borderWidth?: number;
        pointRadius: (context: {
            dataIndex: number;
        }) => number;
        pointHoverRadius: (context: {
            dataIndex: number;
        }) => number;
        pointBackgroundColor: string;
        pointBorderColor: string;
        pointBorderWidth: number;
    }>;
}
export declare const createChartData: (dateIntervals: Date[], historicalData: HistoricalSnapshot[], positions: Position[], timeline: TimelineFilter, showValues: boolean) => ChartData;
