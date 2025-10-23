import { fetchHistoricalPrices } from './yahooFinanceApi';
// Get all positions that existed at a specific date
function getPositionsAtDate(positions, targetDate) {
    const targetTime = targetDate.getTime();
    // Filter positions that existed by the target date
    const relevantPositions = positions.filter(pos => {
        const posDate = new Date(pos.transactionDate);
        return posDate.getTime() <= targetTime;
    });
    // Group positions by ticker to handle multiple transactions of the same stock
    const positionMap = new Map();
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
        }
        else {
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
// Get the closest historical price to a target date
function getClosestHistoricalPrice(historicalPrices, targetDate) {
    const targetDateStr = targetDate.toISOString().split('T')[0];
    // Try exact match first
    if (historicalPrices[targetDateStr]) {
        return historicalPrices[targetDateStr];
    }
    // Find the closest date (preferably before the target date)
    const availableDates = Object.keys(historicalPrices).sort();
    let closestDate = null;
    let minDiff = Infinity;
    for (const dateStr of availableDates) {
        const date = new Date(dateStr);
        const diff = Math.abs(date.getTime() - targetDate.getTime());
        // Prefer dates before or on the target date
        if (date <= targetDate && diff < minDiff) {
            minDiff = diff;
            closestDate = dateStr;
        }
    }
    // If no date before target, use the closest after
    if (!closestDate) {
        for (const dateStr of availableDates) {
            const date = new Date(dateStr);
            const diff = Math.abs(date.getTime() - targetDate.getTime());
            if (diff < minDiff) {
                minDiff = diff;
                closestDate = dateStr;
            }
        }
    }
    return closestDate ? historicalPrices[closestDate] : null;
}
// Calculate portfolio value at a specific historical date
export async function calculatePortfolioValueAtDate(positions, targetDate, historicalPricesCache, includeDetails = false) {
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
    const positionDetails = [];
    // Use cache if provided, otherwise create a temporary one
    const pricesCache = historicalPricesCache || new Map();
    // Calculate value for each position
    for (const position of positionsAtDate) {
        totalCostJPY += position.costInJPY;
        // Get historical prices for this ticker if not cached
        if (!pricesCache.has(position.ticker)) {
            console.log(`📈 Fetching historical prices for ${position.ticker}`);
            // Convert positions to the format expected by fetchHistoricalPrices
            const positionsForApi = positions.map(p => ({
                transactionDate: p.transactionDate,
                ticker: p.ticker.toString(),
                transactionCcy: p.transactionCcy,
                transactionFx: p.transactionFxRate
            }));
            const historicalPrices = await fetchHistoricalPrices(position.ticker, positionsForApi);
            if (historicalPrices) {
                pricesCache.set(position.ticker, historicalPrices);
            }
            else {
                pricesCache.set(position.ticker, {});
            }
        }
        const historicalPrices = pricesCache.get(position.ticker) || {};
        const historicalPrice = getClosestHistoricalPrice(historicalPrices, targetDate);
        let positionValueJPY = 0;
        if (historicalPrice !== null) {
            // Calculate value in JPY (assuming FX rates are already handled in the Position data)
            const valueInBaseCurrency = position.quantity * historicalPrice;
            positionValueJPY = valueInBaseCurrency * position.transactionFxRate;
            totalValueJPY += positionValueJPY;
        }
        else {
            // If no historical price available, use current value as fallback
            console.warn(`⚠️ No historical price found for ${position.ticker} at ${targetDate.toISOString().split('T')[0]}, using current value`);
            const currentPosition = positions.find(p => p.ticker.toString() === position.ticker);
            if (currentPosition) {
                positionValueJPY = (position.quantity / currentPosition.quantity) * currentPosition.currentValueJPY;
                totalValueJPY += positionValueJPY;
            }
        }
        // Collect position details if requested
        if (includeDetails) {
            const originalPosition = positions.find(p => p.ticker.toString() === position.ticker);
            const fullName = (originalPosition === null || originalPosition === void 0 ? void 0 : originalPosition.fullName) || position.ticker;
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
export async function calculateHistoricalPortfolioValues(positions, dates, includeDetails = false) {
    console.log(`📊 Calculating historical portfolio values for ${dates.length} dates`);
    // Pre-fetch all historical prices to avoid repeated API calls
    const uniqueTickers = [...new Set(positions.map(p => p.ticker.toString()))];
    const historicalPricesCache = new Map();
    console.log(`🔄 Pre-fetching historical prices for ${uniqueTickers.length} tickers`);
    for (const ticker of uniqueTickers) {
        // Convert positions to the format expected by fetchHistoricalPrices
        const positionsForApi = positions.map(p => ({
            transactionDate: p.transactionDate,
            ticker: p.ticker.toString(),
            transactionCcy: p.transactionCcy,
            transactionFx: p.transactionFxRate
        }));
        const historicalPrices = await fetchHistoricalPrices(ticker, positionsForApi);
        if (historicalPrices) {
            historicalPricesCache.set(ticker, historicalPrices);
        }
        else {
            historicalPricesCache.set(ticker, {});
        }
    }
    // Sort dates to ensure chronological order
    const sortedDates = [...dates].sort((a, b) => a.getTime() - b.getTime());
    // Calculate values for each date
    const results = [];
    let previousSnapshot = null;
    for (const date of sortedDates) {
        const snapshot = await calculatePortfolioValueAtDate(positions, date, historicalPricesCache, includeDetails);
        // Enhance with additional metrics
        if (previousSnapshot) {
            // We could add day-over-day change calculations here if needed
            // For now, the cumulative P&L is just the same as regular P&L since it's calculated from inception
        }
        results.push(snapshot);
        previousSnapshot = snapshot;
    }
    // Sort results back to match original date order if needed
    const dateIndexMap = new Map(dates.map((date, index) => [date.getTime(), index]));
    results.sort((a, b) => {
        var _a, _b;
        const aIndex = (_a = dateIndexMap.get(a.date.getTime())) !== null && _a !== void 0 ? _a : 0;
        const bIndex = (_b = dateIndexMap.get(b.date.getTime())) !== null && _b !== void 0 ? _b : 0;
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
