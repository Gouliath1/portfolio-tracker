import { Position, RawPosition, PortfolioSummary } from '../types/portfolio';
import { fetchStockPrice, updateAllPositions } from './stockApi';

export const calculatePosition = (rawPosition: RawPosition, currentPrice: number | null): Position => {
    const costInJPY = rawPosition.quantity * rawPosition.costPerUnit * rawPosition.transactionFx;
    const currentValueJPY = currentPrice !== null 
        ? rawPosition.quantity * currentPrice * (rawPosition.baseCcy === 'JPY' ? 1 : rawPosition.transactionFx)
        : 0;
    const pnlJPY = currentPrice !== null ? currentValueJPY - costInJPY : 0;
    const pnlPercentage = currentPrice !== null ? (pnlJPY / costInJPY) * 100 : 0;

    return {
        ...rawPosition,
        currentPrice,
        costInJPY,
        currentValueJPY,
        pnlJPY,
        pnlPercentage
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
    
    // Calculate positions with current prices
    const positions = rawPositions.map(pos => 
        calculatePosition(pos, currentPrices[pos.ticker.toString()])
    );
    
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
