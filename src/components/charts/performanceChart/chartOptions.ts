import { ChartOptions, Chart as ChartJS } from 'chart.js';

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
                color: 'rgba(255,255,255,0.55)',
                font: {
                    size: 13
                },
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
                            
                            if (borderWidth > 1) {
                                label.pointStyle = 'line';
                            }
                        }
                    });
                    
                    return labels;
                },
                filter: function() {
                    return true;
                }
            }
        },
        title: {
            display: true,
            text: showValues
                ? `Portfolio P&L Over Time (${selectedTimeline})`
                : `Portfolio Performance Over Time (${selectedTimeline})`,
            color: 'rgba(255,255,255,0.75)',
            font: {
                size: 14
            }
        },
        tooltip: {
            enabled: false, // Custom tooltip handled externally
        }
    },
    scales: {
        y: {
            type: 'linear',
            display: true,
            position: 'left',
            beginAtZero: true,
            ticks: {
                color: 'rgba(255,255,255,0.40)',
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
                    size: 11
                }
            },
            grid: {
                color: 'rgba(255,255,255,0.06)'
            }
        },
        y1: {
            type: 'linear',
            display: showValues,
            position: 'right',
            beginAtZero: false,
            title: {
                display: true,
                text: 'P&L (JPY)',
                color: 'rgba(255,255,255,0.40)',
                font: {
                    size: 11
                }
            },
            ticks: {
                color: 'rgba(255,255,255,0.40)',
                callback: function(value) {
                    if (typeof value === 'number') {
                        const sign = value >= 0 ? '+' : '';
                        return `${sign}¥${Math.round(value).toLocaleString()}`;
                    }
                    return value;
                },
                font: {
                    size: 11
                }
            },
            grid: {
                drawOnChartArea: false,
            }
        },
        x: {
            grid: {
                color: 'rgba(255,255,255,0.06)'
            },
            ticks: {
                color: 'rgba(255,255,255,0.40)',
                font: {
                    size: 11
                }
            }
        }
    }
});
