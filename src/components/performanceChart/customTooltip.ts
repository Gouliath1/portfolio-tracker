import { Position } from '../../types/portfolio';
import { HistoricalSnapshot } from '../../utils/historicalPortfolioCalculations';
import { TimelineFilter, getIntervalForTimeline, getTransactionsNearDate } from './chartUtils';

export const createCustomTooltip = (
    dateIntervals: Date[],
    historicalData: HistoricalSnapshot[],
    positions: Position[],
    selectedTimeline: TimelineFilter,
    showValues: boolean
// eslint-disable-next-line @typescript-eslint/no-explicit-any
) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (context: any) => {
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
            tooltipEl.style.position = 'fixed';
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
            
            let innerHTML = createTooltipHeader(date);
            innerHTML += createTooltipMainContent(tooltip, snapshot, showValues);
            innerHTML += createTooltipPositionBreakdown(snapshot, showValues);
            innerHTML += createTooltipTransactions(date, positions, selectedTimeline, showValues);
            
            tooltipEl.innerHTML = innerHTML;
        }
        
        positionTooltip(chart, tooltip, tooltipEl);
    };
};

const createTooltipHeader = (date: Date): string => {
    return `<div style="font-weight: 600; margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 4px;">
        ${date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
    </div>`;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createTooltipMainContent = (tooltip: any, snapshot: HistoricalSnapshot | undefined, showValues: boolean): string => {
    const mainValue = tooltip.dataPoints[0].raw as number;
    const label = tooltip.dataPoints[0].dataset.label;
    
    let innerHTML = `<div style="margin-bottom: 8px; font-weight: 500;">
        ${label}: `;
    
    if (showValues) {
        innerHTML += `¥${Math.round(mainValue).toLocaleString()}
    </div>`;
        
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
        innerHTML += `${mainValue.toFixed(2)}%
    </div>`;
        
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
    
    return innerHTML;
};

const createTooltipPositionBreakdown = (snapshot: HistoricalSnapshot | undefined, showValues: boolean): string => {
    if (!snapshot?.positionDetails || snapshot.positionDetails.length === 0) {
        return '';
    }
    
    let innerHTML = '<div style="margin-bottom: 6px; font-weight: 500;">Portfolio Breakdown:</div>';
    
    const sortedPositions = [...snapshot.positionDetails].sort((a, b) => b.valueInJPY - a.valueInJPY);
    
    sortedPositions.forEach((position) => {
        const isPositive = position.pnlPercentage >= 0;
        const pnlColor = isPositive ? '#22c55e' : '#ef4444';
        const pnlPercentSign = position.pnlPercentage >= 0 ? '+' : '';
        
        if (showValues) {
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
            innerHTML += `<div style="margin: 4px 0; font-size: 11px;">
                • ${position.fullName}: 
                <span style="color: ${pnlColor}; font-weight: 600;">
                    ${pnlPercentSign}${position.pnlPercentage.toFixed(1)}%
                </span>
            </div>`;
        }
    });
    
    return innerHTML;
};

const createTooltipTransactions = (
    date: Date, 
    positions: Position[], 
    selectedTimeline: TimelineFilter, 
    showValues: boolean
): string => {
    const currentInterval = getIntervalForTimeline(selectedTimeline);
    const transactions = getTransactionsNearDate(positions, date, currentInterval);
    
    if (transactions.length === 0) {
        return '';
    }
    
    let innerHTML = '<div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.2);">';
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
    return innerHTML;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const positionTooltip = (chart: any, tooltip: any, tooltipEl: HTMLElement) => {
    const canvasRect = chart.canvas.getBoundingClientRect();
    const mouseX = canvasRect.left + tooltip.caretX;
    const mouseY = canvasRect.top + tooltip.caretY;
    
    tooltipEl.style.visibility = 'visible';
    tooltipEl.style.opacity = '1';
    
    const tooltipRect = tooltipEl.getBoundingClientRect();
    
    let left = mouseX + 15;
    if (left + tooltipRect.width > window.innerWidth - 10) {
        left = mouseX - tooltipRect.width - 15;
    }
    if (left < 10) {
        left = 10;
    }
    
    let top = mouseY - tooltipRect.height / 2;
    const chartTop = canvasRect.top;
    
    if (top < chartTop - 20) {
        top = chartTop - 20;
    }
    
    if (top < chartTop && top + tooltipRect.height > chartTop + 50) {
        top = chartTop - 10;
    }
    
    if (top + tooltipRect.height > window.innerHeight - 10) {
        top = window.innerHeight - tooltipRect.height - 10;
    }
    
    tooltipEl.style.left = left + 'px';
    tooltipEl.style.top = top + 'px';
};
