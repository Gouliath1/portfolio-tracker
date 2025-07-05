'use client';

import { useState, useEffect, useCallback } from 'react';
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
import { calculateHistoricalPortfolioValues, HistoricalSnapshot } from '../utils/historicalPortfolioCalculations';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend
);

// Custom plugin to draw colored areas for P&L
const pnlAreaPlugin = {
    id: 'pnlArea',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    beforeDatasetsDraw(chart: any) {
        const { ctx, data, scales } = chart;
        
        // Type guards and null checks
        if (!ctx || !data?.datasets || !scales) return;
        
        // Find the P&L dataset
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pnlDatasetIndex = data.datasets.findIndex((dataset: any) => dataset.label === 'P&L (JPY)');
        if (pnlDatasetIndex === -1) return;
        
        const pnlDataset = data.datasets[pnlDatasetIndex];
        if (!pnlDataset?.data) return;
        
        const yScale = scales.y1; // P&L uses secondary Y-axis
        const xScale = scales.x;
        
        if (!yScale || !xScale) return;
        
        const zeroY = yScale.getPixelForValue(0);
        
        ctx.save();
        
        // Draw areas for each segment
        for (let i = 0; i < pnlDataset.data.length - 1; i++) {
            const currentValue = pnlDataset.data[i] as number;
            const nextValue = pnlDataset.data[i + 1] as number;
            
            if (typeof currentValue !== 'number' || typeof nextValue !== 'number') continue;
            
            const x1 = xScale.getPixelForValue(i);
            const x2 = xScale.getPixelForValue(i + 1);
            const y1 = yScale.getPixelForValue(currentValue);
            const y2 = yScale.getPixelForValue(nextValue);
            
            // Determine color based on values
            const isPositive = currentValue >= 0 && nextValue >= 0;
            const isNegative = currentValue <= 0 && nextValue <= 0;
            
            if (isPositive) {
                ctx.fillStyle = 'rgba(34, 197, 94, 0.3)'; // Green for positive
            } else if (isNegative) {
                ctx.fillStyle = 'rgba(239, 68, 68, 0.3)'; // Red for negative
            } else {
                // Mixed segment - draw two parts
                const intersectionX = x1 + (x2 - x1) * (Math.abs(currentValue) / (Math.abs(currentValue) + Math.abs(nextValue)));
                
                // Draw positive part
                if (currentValue > 0) {
                    ctx.fillStyle = 'rgba(34, 197, 94, 0.3)';
                    ctx.beginPath();
                    ctx.moveTo(x1, zeroY);
                    ctx.lineTo(x1, y1);
                    ctx.lineTo(intersectionX, zeroY);
                    ctx.closePath();
                    ctx.fill();
                }
                
                // Draw negative part
                if (nextValue < 0) {
                    ctx.fillStyle = 'rgba(239, 68, 68, 0.3)';
                    ctx.beginPath();
                    ctx.moveTo(intersectionX, zeroY);
                    ctx.lineTo(x2, y2);
                    ctx.lineTo(x2, zeroY);
                    ctx.closePath();
                    ctx.fill();
                }
                continue;
            }
            
            // Draw the area
            ctx.beginPath();
            ctx.moveTo(x1, zeroY);
            ctx.lineTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.lineTo(x2, zeroY);
            ctx.closePath();
            ctx.fill();
        }
        
        ctx.restore();
    }
};

ChartJS.register(pnlAreaPlugin);

interface PerformanceChartProps {
    positions: Position[];
    showValues: boolean;
}

type TimelineFilter = '1D' | '5D' | '1M' | '6M' | 'YTD' | '1Y' | '2Y' | '5Y' | 'All';

export const PerformanceChart = ({ positions, showValues }: PerformanceChartProps) => {
    const [selectedTimeline, setSelectedTimeline] = useState<TimelineFilter>('All');
    const [historicalData, setHistoricalData] = useState<HistoricalSnapshot[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

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
    const generateDateIntervals = useCallback((timeline: TimelineFilter) => {
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
    }, [positions]);

    // Effect to calculate historical data when timeline or positions change
    useEffect(() => {
        const calculateHistoricalData = async () => {
            if (positions.length === 0) {
                setHistoricalData([]);
                return;
            }

            setIsLoading(true);
            setError(null);

            try {
                const dateIntervals = generateDateIntervals(selectedTimeline);
                const snapshots = await calculateHistoricalPortfolioValues(positions, dateIntervals, true); // Include details for tooltips
                setHistoricalData(snapshots);
            } catch (err) {
                console.error('Error calculating historical data:', err);
                setError('Failed to calculate historical portfolio data');
                setHistoricalData([]);
            } finally {
                setIsLoading(false);
            }
        };

        calculateHistoricalData();
    }, [positions, selectedTimeline, generateDateIntervals]);

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

    // Generate the chart data based on historical snapshots
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
    const pnlData: number[] = [];
    const transactionDates: boolean[] = []; // Track which dates have transactions

    dateIntervals.forEach((date, index) => {
        const snapshot = historicalData[index];
        
        // Get transactions that occurred near this date
        const currentInterval = selectedTimeline === '1D' ? 60 * 60 * 1000 :
                               selectedTimeline === '5D' || selectedTimeline === '1M' ? 24 * 60 * 60 * 1000 :
                               selectedTimeline === '6M' || selectedTimeline === 'YTD' || selectedTimeline === '1Y' || selectedTimeline === '2Y' ? 7 * 24 * 60 * 60 * 1000 :
                               30 * 24 * 60 * 60 * 1000; // Default to monthly for longer periods
        
        const transactions = getTransactionsNearDate(date, currentInterval);
        const hasTransactions = transactions.length > 0;
        
        transactionDates.push(hasTransactions);
        
        if (snapshot) {
            if (showValues) {
                valueData.push(snapshot.totalValueJPY);
                costData.push(snapshot.totalCostJPY);
                pnlData.push(snapshot.pnlJPY);
            } else {
                // For percentage view, use the calculated P&L percentage
                valueData.push(snapshot.pnlPercentage);
                costData.push(0); // No cost line for percentage view
                pnlData.push(0); // No P&L value line for percentage view
            }
        } else {
            // No data available for this date
            valueData.push(0);
            costData.push(0);
            pnlData.push(0);
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
                pointRadius: (context: { dataIndex: number }) => {
                    const index = context.dataIndex;
                    return transactionDates[index] ? 4 : 0; // Only show dots at transaction dates
                },
                pointHoverRadius: (context: { dataIndex: number }) => {
                    const index = context.dataIndex;
                    return transactionDates[index] ? 6 : 3;
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
                hidden: !showValues, // Hide cost line when showing percentages
                pointRadius: (context: { dataIndex: number }) => {
                    const index = context.dataIndex;
                    return transactionDates[index] ? 4 : 0; // Only show dots at transaction dates
                },
                pointHoverRadius: (context: { dataIndex: number }) => {
                    const index = context.dataIndex;
                    return transactionDates[index] ? 6 : 3;
                },
                pointBackgroundColor: 'rgb(148, 163, 184)',
                pointBorderColor: 'rgb(100, 116, 139)',
                pointBorderWidth: 1
            },
            {
                label: 'P&L (JPY)',
                data: pnlData,
                borderColor: 'rgb(0, 0, 0)', // Black line
                backgroundColor: 'rgba(0, 0, 0, 0)', // Transparent - plugin will handle coloring
                tension: 0.1,
                fill: false, // Don't fill - plugin will handle areas
                hidden: !showValues,
                yAxisID: 'y1',
                borderWidth: 2,
                pointRadius: (context: { dataIndex: number }) => {
                    const index = context.dataIndex;
                    return transactionDates[index] ? 4 : 1;
                },
                pointHoverRadius: (context: { dataIndex: number }) => {
                    const index = context.dataIndex;
                    return transactionDates[index] ? 6 : 3;
                },
                pointBackgroundColor: 'rgb(0, 0, 0)',
                pointBorderColor: 'rgb(0, 0, 0)',
                pointBorderWidth: 1
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
                    },
                    usePointStyle: true,
                    pointStyle: 'line',
                    generateLabels: function(chart) {
                        const original = ChartJS.defaults.plugins.legend.labels.generateLabels;
                        const labels = original.call(this, chart);
                        
                        // Customize each label to match the dataset properties
                        labels.forEach((label, index) => {
                            const dataset = chart.data.datasets[index];
                            if (dataset) {
                                label.strokeStyle = dataset.borderColor as string;
                                label.fillStyle = dataset.borderColor as string;
                                
                                // Set line width to match dataset border width
                                const borderWidth = (dataset.borderWidth as number) || 1;
                                label.lineWidth = borderWidth;
                                
                                // Override pointStyle for specific datasets to show thicker lines
                                if (borderWidth > 1) {
                                    // For thick lines, we'll handle this with a custom draw function
                                    label.pointStyle = 'line';
                                }
                            }
                        });
                        
                        return labels;
                    },
                    // Custom filter function to ensure line thickness is respected
                    filter: function(legendItem, chartData) {
                        return true; // Show all legend items
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
                enabled: false, // Disable default tooltip to use custom HTML tooltip
                external: (context) => {
                    // Custom HTML tooltip for color support
                    const { chart, tooltip } = context;
                    
                    // Get or create tooltip element
                    let tooltipEl = document.getElementById('chartjs-tooltip');
                    if (!tooltipEl) {
                        tooltipEl = document.createElement('div');
                        tooltipEl.id = 'chartjs-tooltip';
                        tooltipEl.style.background = 'rgba(0, 0, 0, 0.9)';
                        tooltipEl.style.borderRadius = '8px';
                        tooltipEl.style.color = 'white';
                        tooltipEl.style.padding = '12px 16px';
                        tooltipEl.style.pointerEvents = 'none';
                        tooltipEl.style.position = 'fixed'; // Fixed positioning for floating effect
                        tooltipEl.style.fontSize = '12px';
                        tooltipEl.style.fontFamily = 'Inter, system-ui, sans-serif';
                        tooltipEl.style.lineHeight = '1.4';
                        tooltipEl.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
                        tooltipEl.style.maxWidth = '400px';
                        tooltipEl.style.zIndex = '9999';
                        tooltipEl.style.transition = 'opacity 0.2s ease';
                        document.body.appendChild(tooltipEl);
                    }
                    
                    // Hide if no tooltip
                    if (tooltip.opacity === 0) {
                        tooltipEl.style.opacity = '0';
                        tooltipEl.style.visibility = 'hidden';
                        return;
                    }
                    
                    if (tooltip.body) {
                        const index = tooltip.dataPoints[0].dataIndex;
                        const date = dateIntervals[index];
                        const snapshot = historicalData[index];
                        
                        let innerHTML = `<div style="font-weight: 600; margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 4px;">
                            ${date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                        </div>`;
                        
                        // Add main values
                        const mainValue = tooltip.dataPoints[0].raw as number;
                        const label = tooltip.dataPoints[0].dataset.label;
                        
                        if (showValues) {
                            innerHTML += `<div style="margin-bottom: 8px; font-weight: 500;">
                                ${label}: ¥${Math.round(mainValue).toLocaleString()}
                            </div>`;
                            
                            // Add P&L summary if available
                            if (snapshot) {
                                const pnlFormatted = Math.round(Math.abs(snapshot.pnlJPY)).toLocaleString();
                                const isPositive = snapshot.pnlJPY >= 0;
                                const pnlColor = isPositive ? '#22c55e' : '#ef4444';
                                const pnlSign = isPositive ? '+' : '-';
                                
                                innerHTML += `<div style="margin-bottom: 12px; font-size: 13px;">
                                    <div>Total Value: ¥${Math.round(snapshot.totalValueJPY).toLocaleString()}</div>
                                    <div>Total Cost: ¥${Math.round(snapshot.totalCostJPY).toLocaleString()}</div>
                                    <div style="color: ${pnlColor}; font-weight: 600;">
                                        P&L: ${pnlSign}¥${pnlFormatted} (${snapshot.pnlPercentage >= 0 ? '+' : ''}${snapshot.pnlPercentage.toFixed(2)}%)
                                    </div>
                                </div>`;
                            }
                        } else {
                            innerHTML += `<div style="margin-bottom: 8px; font-weight: 500;">
                                ${label}: ${mainValue.toFixed(2)}%
                            </div>`;
                            
                            // In percentage mode, only show percentage P&L summary
                            if (snapshot) {
                                const isPositive = snapshot.pnlPercentage >= 0;
                                const pnlColor = isPositive ? '#22c55e' : '#ef4444';
                                const pnlSign = snapshot.pnlPercentage >= 0 ? '+' : '';
                                
                                innerHTML += `<div style="margin-bottom: 12px; font-size: 13px;">
                                    <div style="color: ${pnlColor}; font-weight: 600;">
                                        Portfolio P&L: ${pnlSign}${snapshot.pnlPercentage.toFixed(2)}%
                                    </div>
                                </div>`;
                            }
                        }
                        
                        // Show position breakdown if available
                        if (snapshot?.positionDetails && snapshot.positionDetails.length > 0) {
                            innerHTML += '<div style="margin-bottom: 6px; font-weight: 500;">Portfolio Breakdown:</div>';
                            
                            // Sort positions by value (largest first)
                            const sortedPositions = [...snapshot.positionDetails].sort((a, b) => b.valueInJPY - a.valueInJPY);
                            
                            sortedPositions.forEach((position) => {
                                const isPositive = position.pnlPercentage >= 0;
                                const pnlColor = isPositive ? '#22c55e' : '#ef4444';
                                const pnlPercentSign = position.pnlPercentage >= 0 ? '+' : '';
                                
                                if (showValues) {
                                    // Show full details with JPY values
                                    const valueFormatted = Math.round(position.valueInJPY).toLocaleString();
                                    const pnlFormatted = Math.round(Math.abs(position.pnlJPY)).toLocaleString();
                                    const pnlSign = isPositive ? '+' : '-';
                                    const quantityInfo = `${position.quantity} shares`;
                                    
                                    innerHTML += `<div style="margin: 4px 0; font-size: 11px;">
                                        • ${position.fullName}: ¥${valueFormatted} | ${quantityInfo} | 
                                        <span style="color: ${pnlColor}; font-weight: 600;">
                                            ${pnlSign}¥${pnlFormatted} (${pnlPercentSign}${position.pnlPercentage.toFixed(1)}%)
                                        </span>
                                    </div>`;
                                } else {
                                    // Show only percentage P&L
                                    innerHTML += `<div style="margin: 4px 0; font-size: 11px;">
                                        • ${position.fullName}: 
                                        <span style="color: ${pnlColor}; font-weight: 600;">
                                            ${pnlPercentSign}${position.pnlPercentage.toFixed(1)}%
                                        </span>
                                    </div>`;
                                }
                            });
                        }
                        
                        // Get transactions that occurred near this date
                        const currentInterval = selectedTimeline === '1D' ? 60 * 60 * 1000 :
                                               selectedTimeline === '5D' || selectedTimeline === '1M' ? 24 * 60 * 60 * 1000 :
                                               selectedTimeline === '6M' || selectedTimeline === 'YTD' || selectedTimeline === '1Y' || selectedTimeline === '2Y' ? 7 * 24 * 60 * 60 * 1000 :
                                               30 * 24 * 60 * 60 * 1000; // Default to monthly for longer periods
                        
                        const transactions = getTransactionsNearDate(date, currentInterval);
                        
                        if (transactions.length > 0) {
                            innerHTML += '<div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.2);">';
                            innerHTML += '<div style="margin-bottom: 6px; font-weight: 500;">Transactions on this date:</div>';
                            transactions.forEach((transaction: Position) => {
                                if (showValues) {
                                    const totalCost = Math.round(transaction.quantity * transaction.costPerUnit * (transaction.transactionFxRate || 1)).toLocaleString();
                                    innerHTML += `<div style="margin: 4px 0; font-size: 11px;">
                                        • ${transaction.fullName}: ${transaction.quantity} shares @ ¥${totalCost}
                                    </div>`;
                                } else {
                                    innerHTML += `<div style="margin: 4px 0; font-size: 11px;">
                                        • ${transaction.fullName}: ${transaction.quantity} shares
                                    </div>`;
                                }
                            });
                            innerHTML += '</div>';
                        }
                        
                        tooltipEl.innerHTML = innerHTML;
                    }
                    
                    // Position tooltip based on mouse position but constrain to chart area
                    const canvasRect = chart.canvas.getBoundingClientRect();
                    
                    // Get mouse position relative to viewport
                    const mouseX = canvasRect.left + tooltip.caretX;
                    const mouseY = canvasRect.top + tooltip.caretY;
                    
                    // Make tooltip visible to measure its dimensions
                    tooltipEl.style.visibility = 'visible';
                    tooltipEl.style.opacity = '1';
                    
                    // Get tooltip dimensions after content is set
                    const tooltipRect = tooltipEl.getBoundingClientRect();
                    
                    // Calculate horizontal position with viewport constraints
                    let left = mouseX + 15; // 15px offset from cursor
                    
                    // Keep tooltip within viewport horizontally
                    if (left + tooltipRect.width > window.innerWidth - 10) {
                        left = mouseX - tooltipRect.width - 15; // Show on left side of cursor
                    }
                    if (left < 10) {
                        left = 10;
                    }
                    
                    // Calculate vertical position with chart area constraints
                    let top = mouseY - tooltipRect.height / 2; // Try to center vertically on cursor
                    
                    // Ensure tooltip top starts within or just above the chart area
                    const chartTop = canvasRect.top;
                    
                    // Don't let tooltip top go above the chart area (with some margin)
                    if (top < chartTop - 20) {
                        top = chartTop - 20;
                    }
                    
                    // If tooltip would extend too far above the chart, position it to start at chart top
                    if (top < chartTop && top + tooltipRect.height > chartTop + 50) {
                        top = chartTop - 10;
                    }
                    
                    // Allow tooltip to extend below chart area but not below viewport
                    if (top + tooltipRect.height > window.innerHeight - 10) {
                        top = window.innerHeight - tooltipRect.height - 10;
                    }
                    
                    tooltipEl.style.left = left + 'px';
                    tooltipEl.style.top = top + 'px';
                }
            }
        },
        scales: {
            y: {
                type: 'linear',
                display: true,
                position: 'left',
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
            y1: {
                type: 'linear',
                display: true,
                position: 'right',
                beginAtZero: false, // Allow negative values for P&L
                title: {
                    display: true,
                    text: 'P&L (JPY)',
                    font: {
                        size: 12
                    }
                },
                ticks: {
                    callback: function(value) {
                        if (typeof value === 'number') {
                            const sign = value >= 0 ? '+' : '';
                            return `${sign}¥${Math.round(value).toLocaleString()}`;
                        }
                        return value;
                    },
                    font: {
                        size: 12
                    }
                },
                grid: {
                    drawOnChartArea: false, // Don't draw grid lines for secondary axis
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
                {isLoading ? (
                    <div className="flex items-center justify-center h-full text-gray-500">
                        <div className="text-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                            <p>Calculating historical portfolio data...</p>
                        </div>
                    </div>
                ) : error ? (
                    <div className="flex items-center justify-center h-full text-red-500">
                        <div className="text-center">
                            <p className="font-medium">Error loading chart data</p>
                            <p className="text-sm">{error}</p>
                        </div>
                    </div>
                ) : dateIntervals.length > 0 && historicalData.length > 0 ? (
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
