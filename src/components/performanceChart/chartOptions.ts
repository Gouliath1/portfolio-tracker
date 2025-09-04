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
                font: {
                    size: 14
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
            font: {
                size: 16
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
            display: showValues,
            position: 'right',
            beginAtZero: false,
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
                drawOnChartArea: false,
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
});
