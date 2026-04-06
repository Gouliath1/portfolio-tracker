import { Position } from '@portfolio/types';
import { HistoricalSnapshot } from '@portfolio/core';
import { TimelineFilter, getIntervalForTimeline, getTransactionsNearDate } from './chartUtils';

const cssVar = (name: string): string => {
    if (typeof window === 'undefined') return '';
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
};

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
        pointRadius: (context: { dataIndex: number }) => number;
        pointHoverRadius: (context: { dataIndex: number }) => number;
        pointBackgroundColor: string;
        pointBorderColor: string;
        pointBorderWidth: number;
    }>;
}

export const createChartData = (
    dateIntervals: Date[],
    historicalData: HistoricalSnapshot[],
    positions: Position[],
    timeline: TimelineFilter,
    showValues: boolean
): ChartData => {
    const valueData: number[] = [];
    const costData: number[] = [];
    const pnlData: number[] = [];
    const transactionDates: boolean[] = [];

    const currentInterval = getIntervalForTimeline(timeline);

    dateIntervals.forEach((date, index) => {
        const snapshot = historicalData[index];
        const transactions = getTransactionsNearDate(positions, date, currentInterval);
        const hasTransactions = transactions.length > 0;
        
        transactionDates.push(hasTransactions);
        
        if (snapshot) {
            if (showValues) {
                valueData.push(snapshot.totalValueJPY);
                costData.push(snapshot.totalCostJPY);
                pnlData.push(snapshot.pnlJPY);
            } else {
                valueData.push(0); // Hide the value line
                costData.push(0); // Hide the cost line  
                pnlData.push(snapshot.pnlPercentage); // Show P&L percentage
            }
        } else {
            valueData.push(0);
            costData.push(0);
            pnlData.push(0);
        }
    });

    return {
        labels: dateIntervals.map(date => {
            switch (timeline) {
                case '1D':
                    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                case '5D':
                case '1M':
                    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                case '6M':
                case 'YTD':
                case '1Y':
                case '2Y':
                    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                case '5Y':
                case 'All':
                default:
                    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
            }
        }),
        datasets: [
            {
                label: showValues ? 'Total Value (JPY)' : 'P&L %',
                data: valueData,
                borderColor: cssVar('--chart-line1'),
                backgroundColor: cssVar('--chart-line1-fill'),
                tension: 0.3,
                fill: true,
                hidden: !showValues,
                pointRadius: (context: { dataIndex: number }) => transactionDates[context.dataIndex] ? 4 : 0,
                pointHoverRadius: (context: { dataIndex: number }) => transactionDates[context.dataIndex] ? 6 : 3,
                pointBackgroundColor: cssVar('--chart-line1'),
                pointBorderColor: cssVar('--chart-line1'),
                pointBorderWidth: 1
            },
            {
                label: 'Total Cost (JPY)',
                data: costData,
                borderColor: cssVar('--chart-line2'),
                backgroundColor: cssVar('--chart-line2-fill'),
                tension: 0.3,
                fill: false,
                hidden: !showValues,
                pointRadius: (context: { dataIndex: number }) => transactionDates[context.dataIndex] ? 4 : 0,
                pointHoverRadius: (context: { dataIndex: number }) => transactionDates[context.dataIndex] ? 6 : 3,
                pointBackgroundColor: cssVar('--chart-line2'),
                pointBorderColor: cssVar('--chart-line2'),
                pointBorderWidth: 1
            },
            {
                label: showValues ? 'P&L (JPY)' : 'P&L (%)',
                data: pnlData,
                borderColor: cssVar('--chart-line3'),
                backgroundColor: 'transparent',
                tension: 0.3,
                fill: false,
                hidden: false,
                yAxisID: showValues ? 'y1' : 'y',
                borderWidth: 2,
                pointRadius: (context: { dataIndex: number }) => transactionDates[context.dataIndex] ? 4 : 1,
                pointHoverRadius: (context: { dataIndex: number }) => transactionDates[context.dataIndex] ? 6 : 3,
                pointBackgroundColor: cssVar('--chart-line3'),
                pointBorderColor: cssVar('--chart-line3'),
                pointBorderWidth: 1
            }
        ]
    };
};
