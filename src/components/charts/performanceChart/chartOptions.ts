import { ChartOptions, Chart as ChartJS } from 'chart.js';

const cssVar = (name: string): string => {
    if (typeof window === 'undefined') return '';
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
};

export const createChartOptions = (
    showValues: boolean,
    selectedTimeline: string,
    currencySymbol: string = '¥',
    currency: string = 'JPY'
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
                ? `Portfolio P&L Over Time — ${currency} (${selectedTimeline})`
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
                color: cssVar('--chart-line1'),
                callback: function(value) {
                    if (typeof value === 'number') {
                        if (!showValues) return `${value.toFixed(2)}%`;
                        return currency === 'JPY'
                            ? `${currencySymbol}${Math.round(value).toLocaleString()}`
                            : `${currencySymbol}${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
            suggestedMin: 0,
            ticks: {
                color: cssVar('--chart-line3'),
                callback: function(value) {
                    if (typeof value === 'number') {
                        const sign = value >= 0 ? '+' : '';
                        return currency === 'JPY'
                            ? `${sign}${currencySymbol}${Math.round(value).toLocaleString()}`
                            : `${sign}${currencySymbol}${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
