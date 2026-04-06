import { Position } from '@portfolio/types';
import { HistoricalSnapshot } from '@portfolio/core';
import { TimelineFilter, getIntervalForTimeline, getTransactionsNearDate } from './chartUtils';

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
                borderColor: 'rgb(0, 229, 255)',
                backgroundColor: 'rgba(0, 229, 255, 0.07)',
                tension: 0.3,
                fill: true,
                hidden: !showValues,
                pointRadius: (context: { dataIndex: number }) => {
                    return transactionDates[context.dataIndex] ? 4 : 0;
                },
                pointHoverRadius: (context: { dataIndex: number }) => {
                    return transactionDates[context.dataIndex] ? 6 : 3;
                },
                pointBackgroundColor: 'rgb(0, 229, 255)',
                pointBorderColor: 'rgb(0, 180, 220)',
                pointBorderWidth: 1
            },
            {
                label: 'Total Cost (JPY)',
                data: costData,
                borderColor: 'rgba(255,255,255,0.25)',
                backgroundColor: 'rgba(255,255,255,0.03)',
                tension: 0.3,
                fill: false,
                hidden: !showValues,
                pointRadius: (context: { dataIndex: number }) => {
                    return transactionDates[context.dataIndex] ? 4 : 0;
                },
                pointHoverRadius: (context: { dataIndex: number }) => {
                    return transactionDates[context.dataIndex] ? 6 : 3;
                },
                pointBackgroundColor: 'rgba(255,255,255,0.4)',
                pointBorderColor: 'rgba(255,255,255,0.2)',
                pointBorderWidth: 1
            },
            {
                label: showValues ? 'P&L (JPY)' : 'P&L (%)',
                data: pnlData,
                borderColor: 'rgb(0, 255, 136)',
                backgroundColor: 'rgba(0, 255, 136, 0)',
                tension: 0.3,
                fill: false,
                hidden: false,
                yAxisID: showValues ? 'y1' : 'y',
                borderWidth: 2,
                pointRadius: (context: { dataIndex: number }) => {
                    return transactionDates[context.dataIndex] ? 4 : 1;
                },
                pointHoverRadius: (context: { dataIndex: number }) => {
                    return transactionDates[context.dataIndex] ? 6 : 3;
                },
                pointBackgroundColor: 'rgb(0, 255, 136)',
                pointBorderColor: 'rgb(0, 200, 100)',
                pointBorderWidth: 1
            }
        ]
    };
};
