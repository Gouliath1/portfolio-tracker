import { RawPosition, HistoricalPortfolioSnapshot } from '../types/portfolio';

interface MonthlyPortfolio {
    positions: RawPosition[];
    date: Date;
    totalCost: number;
}

export function generateMonthlyDates(startDate: Date, endDate: Date = new Date()): Date[] {
    const dates: Date[] = [];
    const currentDate = new Date(startDate);
    currentDate.setDate(1); // Start from first day of month
    
    while (currentDate <= endDate) {
        dates.push(new Date(currentDate));
        currentDate.setMonth(currentDate.getMonth() + 1);
    }
    
    return dates;
}

export function getPortfolioStateAtDate(positions: RawPosition[], targetDate: Date): MonthlyPortfolio {
    // Convert all dates to timestamp for comparison
    const targetTime = targetDate.getTime();
    
    // Filter positions that existed by the target date
    const relevantPositions = positions.filter(pos => {
        const posDate = new Date(pos.transactionDate);
        return posDate.getTime() <= targetTime;
    });
    
    // Group positions by ticker and account to handle multiple transactions
    const groupedPositions = new Map<string, RawPosition>();
    
    relevantPositions.forEach(pos => {
        const key = `${pos.ticker}-${pos.account}`;
        const existing = groupedPositions.get(key);
        
        if (existing) {
            // If position exists, update quantity and average cost
            const totalCost = existing.quantity * existing.costPerUnit + pos.quantity * pos.costPerUnit;
            const newQuantity = existing.quantity + pos.quantity;
            const averageCost = totalCost / newQuantity;
            
            groupedPositions.set(key, {
                ...pos,
                quantity: newQuantity,
                costPerUnit: averageCost,
            });
        } else {
            groupedPositions.set(key, { ...pos });
        }
    });
    
    const consolidatedPositions = Array.from(groupedPositions.values());
    const totalCost = consolidatedPositions.reduce(
        (sum, pos) => sum + (pos.quantity * pos.costPerUnit * (pos.transactionFx || 1)),
        0
    );
    
    return {
        positions: consolidatedPositions,
        date: targetDate,
        totalCost,
    };
}

export function calculateHistoricalSnapshots(
    positions: RawPosition[],
    startDate: Date = new Date(Math.min(...positions.map(p => new Date(p.transactionDate).getTime()))),
): MonthlyPortfolio[] {
    const dates = generateMonthlyDates(startDate);
    return dates.map(date => getPortfolioStateAtDate(positions, date));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function fetchHistoricalPrices(symbol: string, dates: Date[]): Promise<{ [date: string]: number }> {
    // This is a placeholder. We'll implement the actual historical price fetching later
    // We'll need to modify the Yahoo Finance API call to fetch historical data
    return {};
}

export async function calculateHistoricalValues(positions: RawPosition[]): Promise<HistoricalPortfolioSnapshot[]> {
    // Get monthly snapshots
    const snapshots = calculateHistoricalSnapshots(positions);
    const results: HistoricalPortfolioSnapshot[] = [];
    
    // Process each snapshot
    for (const snapshot of snapshots) {
        const historicalPrices: { [ticker: string]: number } = {};
        
        // Fetch historical prices for all positions in the snapshot
        await Promise.all(
            snapshot.positions.map(async (pos) => {
                const prices = await fetchHistoricalPrices(pos.ticker.toString(), [snapshot.date]);
                const dateStr = snapshot.date.toISOString().split('T')[0];
                historicalPrices[pos.ticker] = prices[dateStr] || 0;
            })
        );
        
        // Calculate total value and P&L for this snapshot
        let totalValue = 0;
        for (const pos of snapshot.positions) {
            const price = historicalPrices[pos.ticker] || 0;
            const value = pos.quantity * price * (pos.baseCcy === 'JPY' ? 1 : (pos.transactionFx || 1));
            totalValue += value;
        }
        
        const pnl = totalValue - snapshot.totalCost;
        const pnlPercentage = (pnl / snapshot.totalCost) * 100;
        
        results.push({
            date: snapshot.date,
            totalValueJPY: totalValue,
            totalCostJPY: snapshot.totalCost,
            pnlJPY: pnl,
            pnlPercentage
        });
    }
    
    return results;
}
