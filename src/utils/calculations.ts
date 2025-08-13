import { Position, RawPosition, PortfolioSummary } from '../types/portfolio';
import { fetchStockPrice, updateAllPositions, convertToJPY } from './yahooFinanceApi';

export const calculatePosition = async (rawPosition: RawPosition, currentPrice: number | null): Promise<Position> => {
    // Convert cost to JPY using chain conversion if needed
    const costConversion = await convertToJPY(
        rawPosition.quantity * rawPosition.costPerUnit,
        rawPosition,
        true // historical
    );
    const costInJPY = costConversion.convertedAmount;
    
    // Use the effective rate (e.g., for EUR: EUR/USD * USD/JPY)
    const transactionFxRate = costConversion.effectiveRate;
    const transactionFxDetails = costConversion.rates;
    
    // Convert current value to JPY
    let currentValueJPY = 0;
    let currentFxRate = 1;
    let currentFxDetails: { [pair: string]: number } = {};
    
    if (currentPrice !== null) {
        const valueConversion = await convertToJPY(
            rawPosition.quantity * currentPrice,
            rawPosition,
            false // current rates
        );
        currentValueJPY = valueConversion.convertedAmount;
        // Use the effective current rate
        currentFxRate = valueConversion.effectiveRate;
        currentFxDetails = valueConversion.rates;
    }
    
    const pnlJPY = currentPrice !== null ? currentValueJPY - costInJPY : 0;
    const pnlPercentage = currentPrice !== null ? (pnlJPY / costInJPY) * 100 : 0;

    return {
        ...rawPosition,
        currentPrice,
        costInJPY,
        currentValueJPY,
        pnlJPY,
        pnlPercentage,
        transactionFxRate,
        currentFxRate,
        transactionFxDetails,
        currentFxDetails
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
