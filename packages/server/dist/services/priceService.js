import { fetchStockPrice } from '@portfolio/core';
import { getHistoricalPricesForSymbol, getTodaysPrice, storePriceData } from '../database/operations/priceOperations';
const getTodayString = () => new Date().toISOString().split('T')[0];
export const getLatestPriceForSymbol = async (symbol, options = {}) => {
    const trimmedSymbol = symbol.trim();
    if (!trimmedSymbol) {
        throw new Error('Symbol is required');
    }
    const today = getTodayString();
    if (!options.forceRefresh) {
        const cachedPrice = await getTodaysPrice(trimmedSymbol);
        if (cachedPrice !== null) {
            return {
                symbol: trimmedSymbol,
                price: cachedPrice,
                date: today,
                source: 'database'
            };
        }
    }
    const freshPrice = await fetchStockPrice(trimmedSymbol, true);
    if (freshPrice !== null) {
        await storePriceData(trimmedSymbol, today, freshPrice);
        return {
            symbol: trimmedSymbol,
            price: freshPrice,
            date: today,
            source: 'fresh'
        };
    }
    // As a fallback, try to read the most recent stored price
    const historicalPrices = await getHistoricalPricesForSymbol(trimmedSymbol);
    const [latestDate] = Object.keys(historicalPrices).sort((a, b) => b.localeCompare(a));
    if (latestDate) {
        return {
            symbol: trimmedSymbol,
            price: historicalPrices[latestDate],
            date: latestDate,
            source: 'database'
        };
    }
    return {
        symbol: trimmedSymbol,
        price: null,
        date: null,
        source: 'fresh'
    };
};
export const storePriceForSymbol = async (symbol, price, date = getTodayString()) => {
    const trimmedSymbol = symbol.trim();
    if (!trimmedSymbol) {
        throw new Error('Symbol is required');
    }
    if (!Number.isFinite(price)) {
        throw new Error('Price must be a finite number');
    }
    await storePriceData(trimmedSymbol, date, price);
};
