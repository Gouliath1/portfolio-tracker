import { Position } from '../../../types/portfolio';
import { HistoricalSnapshot } from '../../../utils/historicalPortfolioCalculations';
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
                borderColor: 'rgb(34, 197, 94)',
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                tension: 0.1,
                fill: true,
                hidden: !showValues,
                pointRadius: (context: { dataIndex: number }) => {
                    return transactionDates[context.dataIndex] ? 4 : 0;
                },
                pointHoverRadius: (context: { dataIndex: number }) => {
                    return transactionDates[context.dataIndex] ? 6 : 3;
                },
                pointBackgroundColor: 'rgb(34, 197, 94)',
                pointBorderColor: 'rgb(22, 163, 74)',
                pointBorderWidth: 1
            },
            {
                label: 'Total Cost (JPY)',
                data: costData,
                borderColor: 'rgb(148, 163, 184)',
                backgroundColor: 'rgba(148, 163, 184, 0.1)',
                tension: 0.1,
                fill: false,
                hidden: !showValues,
                pointRadius: (context: { dataIndex: number }) => {
                    return transactionDates[context.dataIndex] ? 4 : 0;
                },
                pointHoverRadius: (context: { dataIndex: number }) => {
                    return transactionDates[context.dataIndex] ? 6 : 3;
                },
                pointBackgroundColor: 'rgb(148, 163, 184)',
                pointBorderColor: 'rgb(100, 116, 139)',
                pointBorderWidth: 1
            },
            {
                label: showValues ? 'P&L (JPY)' : 'P&L (%)',
                data: pnlData,
                borderColor: 'rgb(0, 0, 0)',
                backgroundColor: 'rgba(0, 0, 0, 0)',
                tension: 0.1,
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
                pointBackgroundColor: 'rgb(0, 0, 0)',
                pointBorderColor: 'rgb(0, 0, 0)',
                pointBorderWidth: 1
            }
        ]
    };
};
