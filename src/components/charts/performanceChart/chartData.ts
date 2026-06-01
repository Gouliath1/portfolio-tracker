import { Position } from '@portfolio/types';
import { HistoricalSnapshot } from '@portfolio/core';
import { TimelineFilter, getIntervalForTimeline, getTransactionsNearDate } from './chartUtils';

const cssVar = (name: string): string => {
    if (typeof window === 'undefined') return '';
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ScriptableColor = string | ((ctx: any) => string | CanvasGradient);

export interface ChartDataset {
    label: string;
    data: number[];
    borderColor: string;
    backgroundColor: ScriptableColor;
    tension: number;
    fill: boolean | { target: string | number };
    hidden: boolean;
    yAxisID?: string;
    borderWidth?: number;
    borderDash?: number[];
    pointRadius: (context: { dataIndex: number }) => number;
    pointHoverRadius: (context: { dataIndex: number }) => number;
    pointBackgroundColor: string;
    pointBorderColor: string;
    pointBorderWidth: number;
}

// Vertical gradient for the P&L area fill — soft, premium, top → bottom.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pnlAreaGradient = (context: any): string | CanvasGradient => {
    const { chart } = context;
    const { ctx, chartArea } = chart;
    if (!chartArea) return 'transparent';
    const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    gradient.addColorStop(0, cssVar('--chart-line3-fill-top'));
    gradient.addColorStop(1, cssVar('--chart-line3-fill-bot'));
    return gradient;
};

export interface ChartData {
    labels: string[];
    datasets: ChartDataset[];
}

export const createChartData = (
    dateIntervals: Date[],
    historicalData: HistoricalSnapshot[],
    positions: Position[],
    timeline: TimelineFilter,
    showValues: boolean,
    currency: string = 'JPY'
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
                valueData.push(0);
                costData.push(0);
                pnlData.push(snapshot.pnlPercentage);
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
                // Portfolio Value — primary, strongest visual weight
                label: showValues ? `Total Value (${currency})` : 'P&L %',
                data: valueData,
                borderColor: cssVar('--chart-line1'),
                backgroundColor: cssVar('--chart-line1-fill'),
                tension: 0.35,
                fill: showValues,
                hidden: !showValues,
                borderWidth: 3,
                pointRadius: (context: { dataIndex: number }) => transactionDates[context.dataIndex] ? 4 : 0,
                pointHoverRadius: (context: { dataIndex: number }) => transactionDates[context.dataIndex] ? 6 : 5,
                pointBackgroundColor: cssVar('--chart-line1'),
                pointBorderColor: cssVar('--surface'),
                pointBorderWidth: 2,
            },
            {
                // Cost Basis — secondary, dashed slate line
                label: `Total Cost (${currency})`,
                data: costData,
                borderColor: cssVar('--chart-line2'),
                backgroundColor: cssVar('--chart-line2-fill'),
                tension: 0.35,
                fill: false,
                hidden: !showValues,
                borderWidth: 2,
                borderDash: [6, 5],
                pointRadius: (context: { dataIndex: number }) => transactionDates[context.dataIndex] ? 3 : 0,
                pointHoverRadius: (context: { dataIndex: number }) => transactionDates[context.dataIndex] ? 5 : 4,
                pointBackgroundColor: cssVar('--chart-line2'),
                pointBorderColor: cssVar('--surface'),
                pointBorderWidth: 2,
            },
            {
                // P&L — finance green with soft gradient area fill
                label: showValues ? `P&L (${currency})` : 'P&L (%)',
                data: pnlData,
                borderColor: cssVar('--chart-line3'),
                backgroundColor: pnlAreaGradient,
                tension: 0.35,
                fill: { target: 'origin' },
                hidden: false,
                yAxisID: 'y',
                borderWidth: 2.5,
                pointRadius: (context: { dataIndex: number }) => transactionDates[context.dataIndex] ? 4 : 0,
                pointHoverRadius: (context: { dataIndex: number }) => transactionDates[context.dataIndex] ? 6 : 5,
                pointBackgroundColor: cssVar('--chart-line3'),
                pointBorderColor: cssVar('--surface'),
                pointBorderWidth: 2,
            },
        ],
    };
};
