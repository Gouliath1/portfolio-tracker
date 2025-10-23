import { refreshAllHistoricalData, refreshFxRatesForDates } from '@portfolio/core';
import { getDbClient } from '../database/config';
import { getActivePositions } from './portfolioService';
export class NoPositionsAvailableError extends Error {
    constructor() {
        super('No positions available for historical refresh');
        this.name = 'NoPositionsAvailableError';
    }
}
const mapPositionsForHistory = (positions) => {
    return positions.map(position => {
        const rawDate = position.transactionDate || '1970-01-01';
        const normalizedDate = rawDate.includes('-') ? rawDate : rawDate.replace(/\//g, '-');
        return {
            ticker: position.ticker.toString(),
            transactionDate: normalizedDate,
            transactionCcy: position.transactionCcy,
        };
    });
};
export const refreshHistoricalDataForActivePortfolio = async () => {
    const rawPositions = await getActivePositions();
    if (rawPositions.length === 0) {
        throw new NoPositionsAvailableError();
    }
    const historicalPositions = mapPositionsForHistory(rawPositions);
    const historicalResults = await refreshAllHistoricalData(historicalPositions);
    const validHistoricalResults = {};
    for (const [symbol, data] of Object.entries(historicalResults)) {
        if (data !== null) {
            validHistoricalResults[symbol] = data;
        }
    }
    const fxResults = await refreshFxRatesForDates(validHistoricalResults, historicalPositions);
    return {
        historicalResults,
        fxResults,
        positionsProcessed: rawPositions.length,
    };
};
export const getHistoricalDataSummary = async () => {
    var _a, _b, _c, _d, _e;
    const client = getDbClient();
    const [pricesCount, fxCount, securitiesCount, recentPriceResult] = await Promise.all([
        client.execute('SELECT COUNT(*) as count FROM securities_prices'),
        client.execute('SELECT COUNT(*) as count FROM fx_rates'),
        client.execute('SELECT COUNT(DISTINCT security_id) as count FROM securities_prices'),
        client.execute('SELECT MAX(price_date) as latest_date FROM securities_prices'),
    ]);
    const lastDataDate = (_b = (_a = recentPriceResult.rows[0]) === null || _a === void 0 ? void 0 : _a.latest_date) !== null && _b !== void 0 ? _b : null;
    let daysSinceLastData = 0;
    if (lastDataDate) {
        const lastDate = new Date(lastDataDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        lastDate.setHours(0, 0, 0, 0);
        daysSinceLastData = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
    }
    return {
        historicalPrices: Number((_c = pricesCount.rows[0].count) !== null && _c !== void 0 ? _c : 0),
        fxRates: Number((_d = fxCount.rows[0].count) !== null && _d !== void 0 ? _d : 0),
        securitiesWithData: Number((_e = securitiesCount.rows[0].count) !== null && _e !== void 0 ? _e : 0),
        lastDataDate,
        daysSinceLastData,
    };
};
