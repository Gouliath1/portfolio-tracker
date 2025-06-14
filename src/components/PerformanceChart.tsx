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
        new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const data = {
        labels: sortedPositions.map(pos => pos.date),
        datasets: [
            {
                label: 'Portfolio Value (JPY)',
                data: sortedPositions.map(pos => pos.totalValue),
                borderColor: 'rgb(75, 192, 192)',
                tension: 0.1
            },
            {
                label: 'Portfolio Cost (JPY)',
                data: sortedPositions.map(pos => pos.totalCost),
                borderColor: 'rgb(153, 102, 255)',
                tension: 0.1
            }
        ]
    };

    const options = {
        responsive: true,
        plugins: {
            legend: {
                position: 'top' as const,
            },
            title: {
                display: true,
                text: 'Portfolio Performance Over Time'
            }
        },
        scales: {
            y: {
                beginAtZero: true
            }
        }
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow">
            <Line data={data} options={options} />
        </div>
    );
};
