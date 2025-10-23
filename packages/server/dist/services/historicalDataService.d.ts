export declare class NoPositionsAvailableError extends Error {
    constructor();
}
export interface HistoricalRefreshResult {
    historicalResults: {
        [symbol: string]: {
            [date: string]: number;
        } | null;
    };
    fxResults: {
        [fxPair: string]: {
            [date: string]: number;
        } | null;
    };
    positionsProcessed: number;
}
export declare const refreshHistoricalDataForActivePortfolio: () => Promise<HistoricalRefreshResult>;
export interface HistoricalDataSummary {
    historicalPrices: number;
    fxRates: number;
    securitiesWithData: number;
    lastDataDate: string | null;
    daysSinceLastData: number;
}
export declare const getHistoricalDataSummary: () => Promise<HistoricalDataSummary>;
