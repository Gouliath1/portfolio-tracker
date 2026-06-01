import { ChartOptions } from 'chart.js';

const cssVar = (name: string): string => {
    if (typeof window === 'undefined') return '';
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
};

export const createChartOptions = (
    showValues: boolean,
    selectedTimeline: string,
    currencySymbol: string = '¥',
    currency: string = 'JPY',
    yBounds?: { min: number; max: number }
): ChartOptions<'line'> => ({
    responsive: true,
    maintainAspectRatio: false,
    // Right padding leaves room for the latest-value pill badges.
    layout: { padding: { right: 64, top: 8 } },
    interaction: {
        mode: 'index',
        intersect: false,
    },
    plugins: {
        // Legend & title are rendered in React for full layout control.
        legend: { display: false },
        title: { display: false },
        tooltip: {
            enabled: false,
        }
    },
    scales: {
        y: {
            type: 'linear',
            display: true,
            position: 'left',
            // Frame the data tightly: edges sit at data min/max ± 10%.
            min: yBounds?.min,
            max: yBounds?.max,
            border: { display: false },
            ticks: {
                color: cssVar('--chart-tick'),
                padding: 8,
                maxTicksLimit: 11,
                includeBounds: false,
                callback: function(value) {
                    if (typeof value === 'number') {
                        if (!showValues) return `${value.toFixed(2)}%`;
                        return currency === 'JPY'
                            ? `${currencySymbol}${Math.round(value).toLocaleString()}`
                            : `${currencySymbol}${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                    }
                    return value;
                },
                font: { size: 12, weight: 500 }
            },
            grid: { color: cssVar('--chart-grid'), lineWidth: 1 }
        },
        x: {
            border: { display: false },
            grid: { display: false },
            ticks: {
                color: cssVar('--chart-tick'),
                maxRotation: 0,
                autoSkipPadding: 16,
                padding: 8,
                font: { size: 12, weight: 500 }
            }
        }
    }
});
