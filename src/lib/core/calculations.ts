import { Position, RawPosition, PortfolioSummary } from '@portfolio/types';
import { fetchStockPrice, updateAllPositions, fetchCurrentFxRate, fetchHistoricalFxRates } from './yahooFinanceApi';

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

export const calculatePosition = async (rawPosition: RawPosition, currentPrice: number | null, baseCurrency: string = 'JPY'): Promise<Position> => {
    // 1. Calculate original FX rate (only if transaction was not in base currency)
    let origFxRate = 1;
    let costPerUnitInBase = rawPosition.costPerUnit;

    if (rawPosition.transactionCcy !== rawPosition.stockCcy) {
        if (rawPosition.transactionCcy !== baseCurrency) {
            const conversion = await convertCurrency(
                rawPosition.costPerUnit,
                rawPosition.transactionCcy,
                baseCurrency,
                true, // historical
                rawPosition.transactionDate
            );
            costPerUnitInBase = conversion.convertedAmount;
            origFxRate = conversion.fxRate;
        }
    } else if (rawPosition.transactionCcy !== baseCurrency) {
        const conversion = await convertCurrency(
            rawPosition.costPerUnit,
            rawPosition.transactionCcy,
            baseCurrency,
            true, // historical
            rawPosition.transactionDate
        );
        costPerUnitInBase = conversion.convertedAmount;
        origFxRate = conversion.fxRate;
    }

    // 2. Calculate cost in base currency
    const costInJPY = costPerUnitInBase * rawPosition.quantity;

    // 3. Calculate current value and FX rate
    let currentValueJPY = 0;
    let currentFxRate = 1;

    if (currentPrice !== null) {
        if (rawPosition.stockCcy !== baseCurrency) {
            const valueConversion = await convertCurrency(
                rawPosition.quantity * currentPrice,
                rawPosition.stockCcy,
                baseCurrency,
                false // current rates
            );
            currentValueJPY = valueConversion.convertedAmount;
            currentFxRate = valueConversion.fxRate;
        } else {
            currentValueJPY = rawPosition.quantity * currentPrice;
            currentFxRate = 1;
        }
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
        transactionFxRate: origFxRate,
        currentFxRate
    };
};

export const calculatePortfolioSummary = async (rawPositions: RawPosition[], forceRefresh: boolean = false, baseCurrency: string = 'JPY'): Promise<PortfolioSummary> => {
    console.log(`📊 calculatePortfolioSummary called with ${rawPositions.length} positions, forceRefresh: ${forceRefresh}, baseCurrency: ${baseCurrency}`);

    const uniqueTickers = [...new Set(rawPositions.map(pos => pos.ticker.toString()))];

    let currentPrices: { [key: string]: number | null } = {};

    if (forceRefresh) {
        currentPrices = await updateAllPositions(uniqueTickers);
    } else {
        for (const pos of rawPositions) {
            const ticker = pos.ticker.toString();
            if (!currentPrices[ticker]) {
                currentPrices[ticker] = await fetchStockPrice(ticker, forceRefresh);
            }
        }
    }

    const positionPromises = rawPositions.map(pos =>
        calculatePosition(pos, currentPrices[pos.ticker.toString()], baseCurrency)
    );
    const positions = await Promise.all(positionPromises);

    const totalCostJPY = positions.reduce((sum, pos) => sum + pos.costInJPY, 0);
    const totalValueJPY = positions.reduce((sum, pos) => sum + pos.currentValueJPY, 0);
    const totalPnlJPY = totalValueJPY - totalCostJPY;
    const totalPnlPercentage = totalCostJPY === 0
        ? 0
        : (totalPnlJPY / totalCostJPY) * 100;

    return {
        totalValueJPY,
        totalCostJPY,
        totalPnlJPY,
        totalPnlPercentage,
        positions
    };
};
