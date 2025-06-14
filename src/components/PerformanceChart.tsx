'use client';

import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Position } from '../types/portfolio';
import { calculatePosition } from '../utils/calculations';

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
}

export const PerformanceChart = ({ positions }: PerformanceChartProps) => {
    // Sort positions by date
    const sortedPositions = [...positions].sort((a, b) => 
        new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime()
    );

    const data = {
        labels: sortedPositions.map(pos => pos.transactionDate),
        datasets: [
            {
                label: 'P&L (JPY)',
                data: sortedPositions.map(pos => pos.pnlJPY),
                borderColor: 'rgb(34, 197, 94)',
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                tension: 0.1,
                fill: true
            }
        ]
    };

    const options = {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 2,
        plugins: {
            legend: {
                position: 'top' as const,
            },
            title: {
                display: true,
                text: 'Portfolio P&L Over Time'
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                ticks: {
                    callback: function(value: number | string) {
                        const numValue = typeof value === 'string' ? parseFloat(value) : value;
                        return `¥${(numValue / 1000).toFixed(0)}k`;
                    }
                }
            }
        }
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow h-[400px]">
            <Line data={data} options={options} />
        </div>
    );
};
