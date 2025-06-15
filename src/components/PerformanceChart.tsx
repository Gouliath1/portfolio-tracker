'use client';

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

export const PerformanceChart = ({ positions, showValues }: PerformanceChartProps) => {
    // Sort positions by date
    const sortedPositions = [...positions].sort((a, b) => 
        new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime()
    );

    // Calculate cumulative costs at each point in time
    let runningCostTotal = 0;
    const cumulativeCosts = sortedPositions.map(pos => {
        runningCostTotal += pos.costInJPY;
        return runningCostTotal;
    });

    const data = {
        labels: sortedPositions.map(pos => pos.transactionDate),
        datasets: [
            {
                label: showValues ? 'Total Value (JPY)' : 'Value %',
                data: sortedPositions.map(pos => showValues ? pos.currentValueJPY : ((pos.currentValueJPY / pos.costInJPY - 1) * 100)),
                borderColor: 'rgb(34, 197, 94)',
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                tension: 0.1,
                fill: true
            },
            {
                label: 'Total Cost (JPY)',
                data: showValues ? cumulativeCosts : Array(sortedPositions.length).fill(0),
                borderColor: 'rgb(148, 163, 184)',
                backgroundColor: 'rgba(148, 163, 184, 0.1)',
                tension: 0.1,
                fill: false,
                hidden: !showValues // Hide cost line when showing percentages
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
                text: showValues ? 'Portfolio P&L Over Time' : 'Portfolio Performance Over Time',
                font: {
                    size: 16
                }
            },
            tooltip: {
                callbacks: {
                    label: (context) => {
                        const value = context.raw as number;
                        if (showValues) {
                            return `P&L: ¥${value.toLocaleString()}`;
                        } else {
                            return `P&L: ${value.toFixed(2)}%`;
                        }
                    }
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
        <div className="w-full bg-white p-4 rounded-lg shadow" style={{ height: '500px' }}>
            <Line data={data} options={options} />
        </div>
    );
};
