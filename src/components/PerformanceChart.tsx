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
    ChartOptions
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Position } from '../types/portfolio';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend
);

interface PerformanceChartProps {
    positions: Position[];
    showValues: boolean;
}

type TimelineFilter = '1D' | '5D' | '1M' | '6M' | 'YTD' | '1Y' | '2Y' | '5Y' | 'All';

export const PerformanceChart = ({ positions, showValues }: PerformanceChartProps) => {
    const [selectedTimeline, setSelectedTimeline] = useState<TimelineFilter>('All');

    const timelineButtons: { key: TimelineFilter; label: string }[] = [
        { key: '1D', label: '1D' },
        { key: '5D', label: '5D' },
        { key: '1M', label: '1M' },
        { key: '6M', label: '6M' },
        { key: 'YTD', label: 'YTD' },
        { key: '1Y', label: '1Y' },
        { key: '2Y', label: '2Y' },
        { key: '5Y', label: '5Y' },
        { key: 'All', label: 'All' }
    ];

    // Generate fixed date intervals for the selected timeline
    const generateDateIntervals = (timeline: TimelineFilter) => {
        const now = new Date();
        const dates: Date[] = [];
        let startDate: Date;
        let interval: number; // in milliseconds

        switch (timeline) {
            case '1D':
                startDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
                interval = 60 * 60 * 1000; // 1 hour intervals
                break;
            case '5D':
                startDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
                interval = 24 * 60 * 60 * 1000; // 1 day intervals
                break;
            case '1M':
                startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
                interval = 24 * 60 * 60 * 1000; // 1 day intervals
                break;
            case '6M':
                startDate = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
                interval = 7 * 24 * 60 * 60 * 1000; // 1 week intervals
                break;
            case 'YTD':
                startDate = new Date(now.getFullYear(), 0, 1);
                interval = 7 * 24 * 60 * 60 * 1000; // 1 week intervals
                break;
            case '1Y':
                startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
                interval = 30 * 24 * 60 * 60 * 1000; // 1 month intervals
                break;
            case '2Y':
                startDate = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate());
                interval = 30 * 24 * 60 * 60 * 1000; // 1 month intervals
                break;
            case '5Y':
                startDate = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());
                interval = 90 * 24 * 60 * 60 * 1000; // 3 month intervals
                break;
            case 'All':
            default:
                // For 'All', use transaction dates as reference points but with regular intervals
                const sortedPositions = [...positions].sort((a, b) => 
                    new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime()
                );
                if (sortedPositions.length === 0) return [];
                
                startDate = new Date(sortedPositions[0].transactionDate);
                interval = 30 * 24 * 60 * 60 * 1000; // 1 month intervals
                break;
        }

        // Generate dates from startDate to now with the specified interval
        let currentDate = new Date(startDate);
        while (currentDate <= now) {
            dates.push(new Date(currentDate));
            currentDate = new Date(currentDate.getTime() + interval);
        }

        // Always include the current date as the last point if it's not already included
        if (dates.length === 0 || dates[dates.length - 1].getTime() < now.getTime() - interval / 2) {
            dates.push(new Date(now));
        }

        return dates;
    };

    // Get transactions that occurred near a specific date (within the interval range)
    const getTransactionsNearDate = (targetDate: Date, intervalMs: number) => {
        const halfInterval = intervalMs / 2;
        const startRange = new Date(targetDate.getTime() - halfInterval);
        const endRange = new Date(targetDate.getTime() + halfInterval);
        
        return positions.filter(pos => {
            const posDate = new Date(pos.transactionDate);
            return posDate >= startRange && posDate <= endRange;
        });
    };

    // Calculate portfolio value at specific dates
    const calculatePortfolioValueAtDate = (targetDate: Date) => {
        // Get all positions that existed at the target date
        const relevantPositions = positions.filter(pos => 
            new Date(pos.transactionDate) <= targetDate
        );

        if (relevantPositions.length === 0) {
            return { totalValue: 0, totalCost: 0, transactions: [] };
        }

        // Calculate cumulative cost and current value for positions held at target date
        let totalCost = 0;
        let totalValue = 0;

        relevantPositions.forEach(pos => {
            totalCost += pos.costInJPY;
            // For now, use current prices as placeholder until historical prices are implemented
            totalValue += pos.currentValueJPY;
        });

        // Get transactions that occurred near this date (using current interval for range)
        const currentInterval = selectedTimeline === '1D' ? 60 * 60 * 1000 :
                               selectedTimeline === '5D' || selectedTimeline === '1M' ? 24 * 60 * 60 * 1000 :
                               selectedTimeline === '6M' || selectedTimeline === 'YTD' || selectedTimeline === '1Y' || selectedTimeline === '2Y' ? 7 * 24 * 60 * 60 * 1000 :
                               30 * 24 * 60 * 60 * 1000; // Default to monthly for longer periods
        
        const transactions = getTransactionsNearDate(targetDate, currentInterval);

        return { totalValue, totalCost, transactions };
    };

    // Generate the chart data based on selected timeline
    const dateIntervals = generateDateIntervals(selectedTimeline);
    
    const chartLabels = dateIntervals.map(date => {
        // Format date based on timeline for better readability
        switch (selectedTimeline) {
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
    });

    const valueData: number[] = [];
    const costData: number[] = [];
    const transactionDates: boolean[] = []; // Track which dates have transactions

    dateIntervals.forEach(date => {
        const portfolioAtDate = calculatePortfolioValueAtDate(date);
        const hasTransactions = portfolioAtDate.transactions && portfolioAtDate.transactions.length > 0;
        
        transactionDates.push(hasTransactions);
        
        if (showValues) {
            valueData.push(portfolioAtDate.totalValue);
            costData.push(portfolioAtDate.totalCost);
        } else {
            // For percentage view, calculate P&L percentage relative to cost
            const pnlPercentage = portfolioAtDate.totalCost > 0 
                ? ((portfolioAtDate.totalValue - portfolioAtDate.totalCost) / portfolioAtDate.totalCost) * 100 
                : 0;
            valueData.push(pnlPercentage);
            costData.push(0); // No cost line for percentage view
        }
    });

    const data = {
        labels: chartLabels,
        datasets: [
            {
                label: showValues ? 'Total Value (JPY)' : 'P&L %',
                data: valueData,
                borderColor: 'rgb(34, 197, 94)',
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                tension: 0.1,
                fill: true,
                pointRadius: (context: any) => {
                    const index = context.dataIndex;
                    return transactionDates[index] ? 8 : 3; // Larger dots for transaction dates
                },
                pointHoverRadius: (context: any) => {
                    const index = context.dataIndex;
                    return transactionDates[index] ? 10 : 5;
                },
                pointBackgroundColor: (context: any) => {
                    const index = context.dataIndex;
                    return transactionDates[index] ? 'rgb(34, 197, 94)' : 'rgba(34, 197, 94, 0.8)';
                },
                pointBorderColor: (context: any) => {
                    const index = context.dataIndex;
                    return transactionDates[index] ? 'rgb(22, 163, 74)' : 'rgba(34, 197, 94, 0.8)';
                },
                pointBorderWidth: (context: any) => {
                    const index = context.dataIndex;
                    return transactionDates[index] ? 2 : 1;
                }
            },
            {
                label: 'Total Cost (JPY)',
                data: costData,
                borderColor: 'rgb(148, 163, 184)',
                backgroundColor: 'rgba(148, 163, 184, 0.1)',
                tension: 0.1,
                fill: false,
                hidden: !showValues, // Hide cost line when showing percentages
                pointRadius: (context: any) => {
                    const index = context.dataIndex;
                    return transactionDates[index] ? 8 : 3;
                },
                pointHoverRadius: (context: any) => {
                    const index = context.dataIndex;
                    return transactionDates[index] ? 10 : 5;
                },
                pointBackgroundColor: (context: any) => {
                    const index = context.dataIndex;
                    return transactionDates[index] ? 'rgb(148, 163, 184)' : 'rgba(148, 163, 184, 0.8)';
                },
                pointBorderColor: (context: any) => {
                    const index = context.dataIndex;
                    return transactionDates[index] ? 'rgb(100, 116, 139)' : 'rgba(148, 163, 184, 0.8)';
                },
                pointBorderWidth: (context: any) => {
                    const index = context.dataIndex;
                    return transactionDates[index] ? 2 : 1;
                }
            }
        ]
    };

    const options: ChartOptions<'line'> = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'index',
            intersect: false,
        },
        plugins: {
            legend: {
                position: 'top',
                labels: {
                    font: {
                        size: 14
                    }
                }
            },
            title: {
                display: true,
                text: showValues 
                    ? `Portfolio P&L Over Time (${selectedTimeline})` 
                    : `Portfolio Performance Over Time (${selectedTimeline})`,
                font: {
                    size: 16
                }
            },
            tooltip: {
                callbacks: {
                    title: (tooltipItems) => {
                        const index = tooltipItems[0].dataIndex;
                        const date = dateIntervals[index];
                        return date.toLocaleDateString('en-US', { 
                            year: 'numeric', 
                            month: 'short', 
                            day: 'numeric' 
                        });
                    },
                    label: (context) => {
                        const value = context.raw as number;
                        const datasetLabel = context.dataset.label;
                        
                        if (showValues) {
                            return `${datasetLabel}: ¥${Math.round(value).toLocaleString()}`;
                        } else {
                            return `${datasetLabel}: ${value.toFixed(2)}%`;
                        }
                    },
                    afterBody: (tooltipItems) => {
                        const index = tooltipItems[0].dataIndex;
                        const date = dateIntervals[index];
                        const portfolioAtDate = calculatePortfolioValueAtDate(date);
                        
                        if (portfolioAtDate.transactions && portfolioAtDate.transactions.length > 0) {
                            const transactionLines = ['', 'Transactions on this date:'];
                            portfolioAtDate.transactions.forEach((transaction: Position) => {
                                const totalCost = Math.round(transaction.quantity * transaction.costPerUnit * transaction.transactionFx).toLocaleString();
                                transactionLines.push(
                                    `${transaction.fullName}: ${transaction.quantity} shares @ ¥${totalCost}`
                                );
                            });
                            return transactionLines;
                        }
                        return [];
                    }
                },
                displayColors: true,
                bodyFont: {
                    size: 12
                },
                titleFont: {
                    size: 13
                }
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                ticks: {
                    callback: function(value) {
                        if (typeof value === 'number') {
                            if (showValues) {
                                return `¥${value.toLocaleString()}`;
                            } else {
                                return `${value.toFixed(2)}%`;
                            }
                        }
                        return value;
                    },
                    font: {
                        size: 12
                    }
                },
                grid: {
                    color: 'rgba(0, 0, 0, 0.1)'
                }
            },
            x: {
                grid: {
                    color: 'rgba(0, 0, 0, 0.1)'
                },
                ticks: {
                    font: {
                        size: 12
                    }
                }
            }
        }
    };

    return (
        <div className="w-full bg-white p-4 rounded-lg shadow">
            {/* Timeline Filter Buttons */}
            <div className="flex flex-wrap gap-2 mb-4 justify-center">
                {timelineButtons.map(({ key, label }) => (
                    <button
                        key={key}
                        onClick={() => setSelectedTimeline(key)}
                        className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                            selectedTimeline === key
                                ? 'bg-blue-600 text-white shadow-md'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>
            
            {/* Chart */}
            <div style={{ height: '450px' }}>
                {dateIntervals.length > 0 ? (
                    <Line data={data} options={options} />
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-500">
                        <p>No data available for the selected time period</p>
                    </div>
                )}
            </div>
        </div>
    );
};
