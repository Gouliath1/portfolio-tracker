import { ChartOptions, Chart as ChartJS } from 'chart.js';

// Read a CSS variable from the document root at call time (theme-aware)
const cssVar = (name: string): string => {
    if (typeof window === 'undefined') return '';
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
};

export const createChartOptions = (
    showValues: boolean,
    selectedTimeline: string
): ChartOptions<'line'> => ({
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
                color: cssVar('--chart-legend'),
                font: { size: 13 },
                usePointStyle: true,
                pointStyle: 'line',
                generateLabels: function(chart) {
                    const original = ChartJS.defaults.plugins.legend.labels.generateLabels;
                    const labels = original.call(this, chart);
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    labels.forEach((label: any, index: number) => {
                        const dataset = chart.data.datasets[index];
                        if (dataset) {
                            label.strokeStyle = dataset.borderColor as string;
                            label.fillStyle = dataset.borderColor as string;
                            const borderWidth = (dataset.borderWidth as number) || 1;
                            label.lineWidth = borderWidth;
                            if (borderWidth > 1) label.pointStyle = 'line';
                        }
                    });
                    return labels;
                },
                filter: function() { return true; }
            }
        },
        title: {
            display: true,
            text: showValues
                ? `Portfolio P&L Over Time (${selectedTimeline})`
                : `Portfolio Performance Over Time (${selectedTimeline})`,
            color: cssVar('--chart-title'),
            font: { size: 14 }
        },
        tooltip: {
            enabled: false,
        }
    },
    scales: {
        y: {
            type: 'linear',
            display: true,
            position: 'left',
            beginAtZero: true,
            ticks: {
                color: cssVar('--chart-tick'),
                callback: function(value) {
                    if (typeof value === 'number') {
                        return showValues ? `¥${value.toLocaleString()}` : `${value.toFixed(2)}%`;
                    }
                    return value;
                },
                font: { size: 11 }
            },
            grid: { color: cssVar('--chart-grid') }
        },
        y1: {
            type: 'linear',
            display: showValues,
            position: 'right',
            beginAtZero: false,
            title: {
                display: true,
                text: 'P&L (JPY)',
                color: cssVar('--chart-tick'),
                font: { size: 11 }
            },
            ticks: {
                color: cssVar('--chart-tick'),
                callback: function(value) {
                    if (typeof value === 'number') {
                        const sign = value >= 0 ? '+' : '';
                        return `${sign}¥${Math.round(value).toLocaleString()}`;
                    }
                    return value;
                },
                font: { size: 11 }
            },
            grid: { drawOnChartArea: false }
        },
        x: {
            grid: { color: cssVar('--chart-grid') },
            ticks: {
                color: cssVar('--chart-tick'),
                font: { size: 11 }
            }
        }
    }
});
