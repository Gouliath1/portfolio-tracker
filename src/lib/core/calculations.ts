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
    const isClosed = !!rawPosition.saleDate;

    // 1. Calculate original FX rate (only if transaction was not in base currency)
    let origFxRate = 1;
    let costPerUnitInBase = rawPosition.costPerUnit;

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

    // 2. Calculate cost in base currency
    const costInJPY = costPerUnitInBase * rawPosition.quantity;

    // 3a. Closed lot: compute realized P&L using historical FX at sale date.
    if (isClosed) {
        const saleCcy = rawPosition.saleCcy ?? rawPosition.stockCcy;
        const salePricePerUnit = rawPosition.salePricePerUnit ?? 0;
        let salePricePerUnitInBase = salePricePerUnit;
        let saleFxRate = 1;
        if (saleCcy !== baseCurrency) {
            const conversion = await convertCurrency(
                salePricePerUnit,
                saleCcy,
                baseCurrency,
                true, // historical
                rawPosition.saleDate
            );
            salePricePerUnitInBase = conversion.convertedAmount;
            saleFxRate = conversion.fxRate;
        }
        const proceedsJPY = salePricePerUnitInBase * rawPosition.quantity;
        const realizedPnlJPY = proceedsJPY - costInJPY;
        const realizedPnlPercentage = costInJPY === 0 ? 0 : (realizedPnlJPY / costInJPY) * 100;

        return {
            ...rawPosition,
            status: 'closed',
            currentPrice: null,
            costInJPY,
            currentValueJPY: 0,
            pnlJPY: 0,
            pnlPercentage: 0,
            transactionFxRate: origFxRate,
            currentFxRate: 1,
            proceedsJPY,
            realizedPnlJPY,
            realizedPnlPercentage,
            saleFxRate,
        };
    }

    // 3b. Open lot: current value and FX rate
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
        status: 'open',
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
    // Only fetch live prices for tickers that have at least one open lot.
    const openTickers = [...new Set(rawPositions.filter(p => !p.saleDate).map(pos => pos.ticker.toString()))];

    let currentPrices: { [key: string]: number | null } = {};

    if (forceRefresh) {
        currentPrices = await updateAllPositions(openTickers);

        // Also refresh the current FX rate for each pair we'll convert through.
        // calculatePosition uses cached current FX rates, so without this the
        // cache stays stale across "Refresh" clicks even though prices update.
        const openPairs = [...new Set(
            rawPositions
                .filter(p => !p.saleDate && p.stockCcy !== baseCurrency)
                .map(p => `${p.stockCcy}${baseCurrency}`)
        )];
        await Promise.all(openPairs.map(pair => fetchCurrentFxRate(pair, true)));
    } else {
        const entries = await Promise.all(
            openTickers.map(async ticker => [ticker, await fetchStockPrice(ticker, forceRefresh)] as const)
        );
        currentPrices = Object.fromEntries(entries);
    }

    const positionPromises = rawPositions.map(pos =>
        calculatePosition(pos, pos.saleDate ? null : currentPrices[pos.ticker.toString()] ?? null, baseCurrency)
    );
    const allPositions = await Promise.all(positionPromises);

    const positions = allPositions.filter(p => p.status === 'open');
    const closedPositions = allPositions.filter(p => p.status === 'closed');

    const totalCostJPY = positions.reduce((sum, pos) => sum + pos.costInJPY, 0);
    const totalValueJPY = positions.reduce((sum, pos) => sum + pos.currentValueJPY, 0);
    const totalPnlJPY = totalValueJPY - totalCostJPY;
    const totalPnlPercentage = totalCostJPY === 0
        ? 0
        : (totalPnlJPY / totalCostJPY) * 100;

    const realizedCostJPY = closedPositions.reduce((sum, pos) => sum + pos.costInJPY, 0);
    const realizedPnlJPY = closedPositions.reduce((sum, pos) => sum + (pos.realizedPnlJPY ?? 0), 0);
    const realizedPnlPercentage = realizedCostJPY === 0
        ? 0
        : (realizedPnlJPY / realizedCostJPY) * 100;

    return {
        totalValueJPY,
        totalCostJPY,
        totalPnlJPY,
        totalPnlPercentage,
        positions,
        closedPositions,
        realizedPnlJPY,
        realizedCostJPY,
        realizedPnlPercentage,
    };
};
