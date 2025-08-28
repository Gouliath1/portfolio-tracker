import { Position, RawPosition, PortfolioSummary } from '../types/portfolio';
import { fetchStockPrice, updateAllPositions, fetchCurrentFxRate, fetchHistoricalFxRates, BASE_CURRENCY_CONSTANT } from './yahooFinanceApi';

// Helper function to get a single historical FX rate for a specific date
async function getHistoricalFxRate(fxPair: string, date: string): Promise<number> {
    const rates = await fetchHistoricalFxRates(fxPair, [date]);
    if (rates && rates[date]) {
        return rates[date];
    }
    
    // Fallback to current rate if historical not available
    console.warn(`Historical FX rate not available for ${fxPair} on ${date}, using current rate`);
    const currentRate = await fetchCurrentFxRate(fxPair);
    return currentRate || 1;
}

// Helper function to get current FX rate
async function getCurrentFxRate(fxPair: string): Promise<number> {
    const rate = await fetchCurrentFxRate(fxPair);
    return rate || 1;
}

// Helper function to convert amount using FX rate (amount * rate)
async function convertCurrency(amount: number, fromCcy: string, toCcy: string, isHistorical: boolean = false, transactionDate?: string): Promise<{ convertedAmount: number, fxRate: number }> {
    if (fromCcy === toCcy) {
        return { convertedAmount: amount, fxRate: 1 };
    }
    
    const fxPair = `${fromCcy}${toCcy}`;
    let fxRate: number;
    
    if (isHistorical && transactionDate) {
        const dateFormatted = transactionDate.replace(/\//g, '-');
        fxRate = await getHistoricalFxRate(fxPair, dateFormatted);
    } else {
        fxRate = await getCurrentFxRate(fxPair);
    }
    
    return { 
        convertedAmount: amount * fxRate, 
        fxRate 
    };
}

export const calculatePosition = async (rawPosition: RawPosition, currentPrice: number | null): Promise<Position> => {
    const baseCcy = BASE_CURRENCY_CONSTANT; // JPY
    
    // 1. Calculate original FX rate (only if transaction was not in stock currency)
    let origFxRate = 1;
    let costPerUnitInBase = rawPosition.costPerUnit;
    
    if (rawPosition.transactionCcy !== rawPosition.stockCcy) {
        // Convert transaction currency to stock currency first, then to base currency
        if (rawPosition.transactionCcy !== baseCcy) {
            const conversion = await convertCurrency(
                rawPosition.costPerUnit, 
                rawPosition.transactionCcy, 
                baseCcy, 
                true, // historical
                rawPosition.transactionDate
            );
            costPerUnitInBase = conversion.convertedAmount;
            origFxRate = conversion.fxRate;
        }
    } else if (rawPosition.transactionCcy !== baseCcy) {
        // Transaction was in stock currency but not base currency
        const conversion = await convertCurrency(
            rawPosition.costPerUnit, 
            rawPosition.transactionCcy, 
            baseCcy, 
            true, // historical
            rawPosition.transactionDate
        );
        costPerUnitInBase = conversion.convertedAmount;
        origFxRate = conversion.fxRate;
    }
    
    // 2. Calculate cost in base currency (JPY)
    const costInJPY = costPerUnitInBase * rawPosition.quantity;
    
    // 3. Calculate current value and FX rate
    let currentValueJPY = 0;
    let currentFxRate = 1;
    
    if (currentPrice !== null) {
        if (rawPosition.stockCcy !== baseCcy) {
            // Convert current value from stock currency to base currency
            const valueConversion = await convertCurrency(
                rawPosition.quantity * currentPrice,
                rawPosition.stockCcy,
                baseCcy,
                false // current rates
            );
            currentValueJPY = valueConversion.convertedAmount;
            currentFxRate = valueConversion.fxRate;
        } else {
            // Stock is already in base currency
            currentValueJPY = rawPosition.quantity * currentPrice;
            currentFxRate = 1;
        }
    }
    
    const pnlJPY = currentPrice !== null ? currentValueJPY - costInJPY : 0;
    const pnlPercentage = currentPrice !== null ? (pnlJPY / costInJPY) * 100 : 0;

    return {
        ...rawPosition,
        currentPrice, // Current price in stock currency
        costInJPY,
        currentValueJPY,
        pnlJPY,
        pnlPercentage,
        transactionFxRate: origFxRate, // Original FX rate (transaction ccy to base ccy)
        currentFxRate // Current FX rate (stock ccy to base ccy)
    };
};

export const calculatePortfolioSummary = async (rawPositions: RawPosition[], forceRefresh: boolean = false): Promise<PortfolioSummary> => {
    console.log(`📊 calculatePortfolioSummary called with ${rawPositions.length} positions, forceRefresh: ${forceRefresh}`);
    
    // Get unique tickers
    const uniqueTickers = [...new Set(rawPositions.map(pos => pos.ticker.toString()))];
    console.log(`🎯 Unique tickers to fetch: ${uniqueTickers.join(', ')}`);
    
    let currentPrices: { [key: string]: number | null } = {};
    
    if (forceRefresh) {
        // Use batch processing for force refresh to be gentler on Yahoo Finance
        console.log(`🔄 Force refresh: using batch processing for ${uniqueTickers.length} symbols`);
        currentPrices = await updateAllPositions(uniqueTickers);
    } else {
        // Normal operation: fetch prices individually (will use cache)
        for (const pos of rawPositions) {
            const ticker = pos.ticker.toString();
            if (!currentPrices[ticker]) {
                currentPrices[ticker] = await fetchStockPrice(ticker, forceRefresh);
            }
        }
    }
    
    // Calculate positions with current prices (async)
    const positionPromises = rawPositions.map(pos => 
        calculatePosition(pos, currentPrices[pos.ticker.toString()])
    );
    const positions = await Promise.all(positionPromises);
    
    // Calculate totals
    const totalCostJPY = positions.reduce((sum, pos) => sum + pos.costInJPY, 0);
    const totalValueJPY = positions.reduce((sum, pos) => sum + pos.currentValueJPY, 0);
    const totalPnlJPY = totalValueJPY - totalCostJPY;
    const totalPnlPercentage = (totalPnlJPY / totalCostJPY) * 100;

    return {
        totalValueJPY,
        totalCostJPY,
        totalPnlJPY,
        totalPnlPercentage,
        positions
    };
};
