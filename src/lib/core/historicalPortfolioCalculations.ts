import { Position } from '@portfolio/types';
import { fetchHistoricalPrices, fetchHistoricalFxRates } from './yahooFinanceApi';

export interface HistoricalSnapshot {
    date: Date;
    totalValueJPY: number;
    totalCostJPY: number;
    pnlJPY: number;
    pnlPercentage: number;
    positionsCount: number;
    positionDetails?: PositionDetail[]; // Optional detailed breakdown for tooltips
    // Additional tracking for cumulative vs daily P&L
    cumulativePnlJPY: number; // Total P&L from inception to this date
    cumulativePnlPercentage: number; // Total P&L % from inception to this date
}

export interface PositionDetail {
    ticker: string;
    fullName: string;
    quantity: number;
    costPerUnit: number;
    costInJPY: number;
    valueInJPY: number;
    pnlJPY: number;
    pnlPercentage: number;
    historicalPrice: number | null;
    transactionFxRate: number;
}

interface PositionAtDate {
    ticker: string;
    quantity: number;
    costPerUnit: number;
    costInJPY: number;
    transactionFxRate: number;
}

// Get all positions that existed at a specific date
function getPositionsAtDate(positions: Position[], targetDate: Date): PositionAtDate[] {
    const targetTime = targetDate.getTime();
    
    // Filter positions that existed by the target date
    const relevantPositions = positions.filter(pos => {
        const posDate = new Date(pos.transactionDate);
        return posDate.getTime() <= targetTime;
    });
    
    // Group positions by ticker to handle multiple transactions of the same stock
    const positionMap = new Map<string, PositionAtDate>();
    
    relevantPositions.forEach(pos => {
        const existing = positionMap.get(pos.ticker.toString());
        
        if (existing) {
            // Calculate weighted average cost for multiple transactions
            const totalCostExisting = existing.quantity * existing.costPerUnit;
            const totalCostNew = pos.quantity * pos.costPerUnit;
            const totalCost = totalCostExisting + totalCostNew;
            const totalQuantity = existing.quantity + pos.quantity;
            
            positionMap.set(pos.ticker.toString(), {
                ticker: pos.ticker.toString(),
                quantity: totalQuantity,
                costPerUnit: totalCost / totalQuantity,
                costInJPY: existing.costInJPY + pos.costInJPY,
                transactionFxRate: existing.transactionFxRate // Keep the original FX rate for now
            });
        } else {
            positionMap.set(pos.ticker.toString(), {
                ticker: pos.ticker.toString(),
                quantity: pos.quantity,
                costPerUnit: pos.costPerUnit,
                costInJPY: pos.costInJPY,
                transactionFxRate: pos.transactionFxRate
            });
        }
    });
    
    return Array.from(positionMap.values());
}

// Get the closest historical price on or before a target date (binary search, O(log N)).
// Falls back to the earliest available price if target predates all data.
function getClosestHistoricalPrice(historicalPrices: {[date: string]: number}, targetDate: Date): number | null {
    const targetDateStr = targetDate.toISOString().split('T')[0];

    if (historicalPrices[targetDateStr] !== undefined) {
        return historicalPrices[targetDateStr];
    }

    const sortedDates = Object.keys(historicalPrices).sort();
    if (sortedDates.length === 0) return null;

    let lo = 0, hi = sortedDates.length - 1, best = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (sortedDates[mid] <= targetDateStr) {
            best = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }

    const idx = best !== -1 ? best : 0;
    return historicalPrices[sortedDates[idx]];
}

// Calculate portfolio value at a specific historical date
export async function calculatePortfolioValueAtDate(
    positions: Position[],
    targetDate: Date,
    historicalPricesCache?: Map<string, {[date: string]: number}>,
    includeDetails: boolean = false,
    baseCurrency: string = 'JPY',
    historicalFxCache?: Map<string, {[date: string]: number}>,
    interval: '1mo' | '1d' = '1mo'
): Promise<HistoricalSnapshot> {
    const positionsAtDate = getPositionsAtDate(positions, targetDate);

    if (positionsAtDate.length === 0) {
        return {
            date: targetDate,
            totalValueJPY: 0,
            totalCostJPY: 0,
            pnlJPY: 0,
            pnlPercentage: 0,
            positionsCount: 0,
            positionDetails: includeDetails ? [] : undefined,
            cumulativePnlJPY: 0,
            cumulativePnlPercentage: 0
        };
    }

    let totalValueJPY = 0;
    let totalCostJPY = 0;
    const positionDetails: PositionDetail[] = [];

    // Use cache if provided, otherwise create a temporary one
    const pricesCache = historicalPricesCache || new Map();
    const fxCache = historicalFxCache || new Map();

    // Calculate value for each position
    for (const position of positionsAtDate) {
        totalCostJPY += position.costInJPY;

        // Get historical prices for this ticker if not cached
        if (!pricesCache.has(position.ticker)) {
            console.log(`📈 Fetching historical prices for ${position.ticker}`);
            const positionsForApi = positions.map(p => ({
                transactionDate: p.transactionDate,
                ticker: p.ticker.toString(),
                transactionCcy: p.transactionCcy,
                transactionFx: p.transactionFxRate
            }));
            const historicalPrices = await fetchHistoricalPrices(position.ticker, positionsForApi, interval);
            if (historicalPrices) {
                pricesCache.set(position.ticker, historicalPrices);
            } else {
                pricesCache.set(position.ticker, {});
            }
        }

        const historicalPrices = pricesCache.get(position.ticker) || {};
        const historicalPrice = getClosestHistoricalPrice(historicalPrices, targetDate);

        // Resolve the stock currency for this ticker
        const originalPosition = positions.find(p => p.ticker.toString() === position.ticker);
        const stockCcy = originalPosition?.stockCcy ?? baseCurrency;

        let positionValueJPY = 0;

        if (historicalPrice !== null) {
            const valueInStockCcy = position.quantity * historicalPrice;

            if (stockCcy === baseCurrency) {
                positionValueJPY = valueInStockCcy;
            } else {
                // Use the FX rate at targetDate, not the transaction-date FX rate
                const fxPair = `${stockCcy}${baseCurrency}`;
                if (!fxCache.has(fxPair)) {
                    const targetDateStr = targetDate.toISOString().split('T')[0];
                    const rates = await fetchHistoricalFxRates(fxPair, [targetDateStr]);
                    fxCache.set(fxPair, rates ?? {});
                }
                const fxRates = fxCache.get(fxPair) ?? {};
                const fxRate = getClosestHistoricalPrice(fxRates, targetDate) ?? position.transactionFxRate;
                positionValueJPY = valueInStockCcy * fxRate;
            }
            totalValueJPY += positionValueJPY;
        } else {
            // If no historical price available, use current value as fallback
            console.warn(`⚠️ No historical price found for ${position.ticker} at ${targetDate.toISOString().split('T')[0]}, using current value`);
            if (originalPosition) {
                positionValueJPY = (position.quantity / originalPosition.quantity) * originalPosition.currentValueJPY;
                totalValueJPY += positionValueJPY;
            }
        }

        // Collect position details if requested
        if (includeDetails) {
            const fullName = originalPosition?.fullName || position.ticker;
            const positionPnlJPY = positionValueJPY - position.costInJPY;
            const positionPnlPercentage = position.costInJPY > 0 ? (positionPnlJPY / position.costInJPY) * 100 : 0;

            positionDetails.push({
                ticker: position.ticker,
                fullName,
                quantity: position.quantity,
                costPerUnit: position.costPerUnit,
                costInJPY: position.costInJPY,
                valueInJPY: positionValueJPY,
                pnlJPY: positionPnlJPY,
                pnlPercentage: positionPnlPercentage,
                historicalPrice,
                transactionFxRate: position.transactionFxRate
            });
        }
    }
    
    const pnlJPY = totalValueJPY - totalCostJPY;
    const pnlPercentage = totalCostJPY > 0 ? (pnlJPY / totalCostJPY) * 100 : 0;
    
    // For now, cumulative P&L is the same as regular P&L
    // In the future, we could track this differently if needed
    const cumulativePnlJPY = pnlJPY;
    const cumulativePnlPercentage = pnlPercentage;
    
    return {
        date: targetDate,
        totalValueJPY,
        totalCostJPY,
        pnlJPY,
        pnlPercentage,
        positionsCount: positionsAtDate.length,
        positionDetails: includeDetails ? positionDetails : undefined,
        cumulativePnlJPY,
        cumulativePnlPercentage
    };
}

// Calculate portfolio values for multiple dates efficiently
export async function calculateHistoricalPortfolioValues(
    positions: Position[],
    dates: Date[],
    includeDetails: boolean = false,
    baseCurrency: string = 'JPY',
    interval: '1mo' | '1d' = '1mo'
): Promise<HistoricalSnapshot[]> {
    console.log(`📊 Calculating historical portfolio values for ${dates.length} dates`);

    // Pre-fetch all historical prices to avoid repeated API calls
    const uniqueTickers = [...new Set(positions.map(p => p.ticker.toString()))];
    const historicalPricesCache = new Map<string, {[date: string]: number}>();
    const historicalFxCache = new Map<string, {[date: string]: number}>();

    console.log(`🔄 Pre-fetching historical prices for ${uniqueTickers.length} tickers`);
    const positionsForApi = positions.map(p => ({
        transactionDate: p.transactionDate,
        ticker: p.ticker.toString(),
        transactionCcy: p.transactionCcy,
        transactionFx: p.transactionFxRate
    }));
    for (const ticker of uniqueTickers) {
        const historicalPrices = await fetchHistoricalPrices(ticker, positionsForApi, interval);
        if (historicalPrices) {
            historicalPricesCache.set(ticker, historicalPrices);
        } else {
            historicalPricesCache.set(ticker, {});
        }
    }

    // Pre-fetch FX rates for all required pairs across all dates
    const uniqueStockCcys = [...new Set(positions.map(p => p.stockCcy).filter(c => c !== baseCurrency))];
    if (uniqueStockCcys.length > 0) {
        const allDateStrs = dates.map(d => d.toISOString().split('T')[0]);
        for (const stockCcy of uniqueStockCcys) {
            const fxPair = `${stockCcy}${baseCurrency}`;
            const rates = await fetchHistoricalFxRates(fxPair, allDateStrs);
            historicalFxCache.set(fxPair, rates ?? {});
        }
    }

    // Sort dates to ensure chronological order
    const sortedDates = [...dates].sort((a, b) => a.getTime() - b.getTime());

    // Calculate values for each date
    const results: HistoricalSnapshot[] = [];

    for (const date of sortedDates) {
        const snapshot = await calculatePortfolioValueAtDate(
            positions, date, historicalPricesCache, includeDetails, baseCurrency, historicalFxCache, interval
        );
        results.push(snapshot);
    }
    
    // Sort results back to match original date order if needed
    const dateIndexMap = new Map(dates.map((date, index) => [date.getTime(), index]));
    results.sort((a, b) => {
        const aIndex = dateIndexMap.get(a.date.getTime()) ?? 0;
        const bIndex = dateIndexMap.get(b.date.getTime()) ?? 0;
        return aIndex - bIndex;
    });
    
    console.log(`✅ Completed historical calculations for ${results.length} snapshots`);
    
    // Log some key metrics for debugging
    if (results.length > 0) {
        const firstSnapshot = results[0];
        const lastSnapshot = results[results.length - 1];
        console.log(`📈 Historical P&L Summary:`);
        console.log(`   First date (${firstSnapshot.date.toISOString().split('T')[0]}): ¥${Math.round(firstSnapshot.pnlJPY).toLocaleString()} (${firstSnapshot.pnlPercentage.toFixed(2)}%)`);
        console.log(`   Last date (${lastSnapshot.date.toISOString().split('T')[0]}): ¥${Math.round(lastSnapshot.pnlJPY).toLocaleString()} (${lastSnapshot.pnlPercentage.toFixed(2)}%)`);
        console.log(`   Total cost progression: ¥${Math.round(firstSnapshot.totalCostJPY).toLocaleString()} → ¥${Math.round(lastSnapshot.totalCostJPY).toLocaleString()}`);
        console.log(`   Total value progression: ¥${Math.round(firstSnapshot.totalValueJPY).toLocaleString()} → ¥${Math.round(lastSnapshot.totalValueJPY).toLocaleString()}`);
    }
    
    return results;
}
