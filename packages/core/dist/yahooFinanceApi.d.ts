interface Position {
    transactionDate: string;
    ticker: string;
    transactionCcy?: string;
}
interface RawPosition {
    transactionDate: string;
    ticker: string | number;
    transactionCcy: string;
    fullName?: string;
    account?: string;
    quantity?: number;
    costPerUnit?: number;
}
export declare function fetchHistoricalPrices(symbol: string, positions: Position[]): Promise<{
    [date: string]: number;
} | null>;
export declare function fetchStockPrice(symbol: string, forceRefresh?: boolean): Promise<number | null>;
export declare function updateAllPositions(symbols: string[]): Promise<{
    [key: string]: number | null;
}>;
export declare function refreshAllHistoricalData(positions: Position[]): Promise<{
    [symbol: string]: {
        [date: string]: number;
    } | null;
}>;
export declare function fetchHistoricalFxRates(fxPair: string, availableDates: string[]): Promise<{
    [date: string]: number;
} | null>;
export declare function fetchCurrentFxRate(fxPair: string, forceRefresh?: boolean): Promise<number | null>;
export declare function refreshFxRatesForDates(priceData: {
    [symbol: string]: {
        [date: string]: number;
    };
}, positions: (Position | RawPosition)[]): Promise<{
    [fxPair: string]: {
        [date: string]: number;
    } | null;
}>;
export declare function refreshCurrentFxRates(positions: (Position | RawPosition)[]): Promise<{
    [fxPair: string]: number | null;
}>;
export declare function getFxPairForPosition(position: Position | RawPosition): string | null;
export declare function convertToJPY(amount: number, position: Position | RawPosition, isHistorical?: boolean): Promise<{
    convertedAmount: number;
    effectiveRate: number;
    rates: {
        [pair: string]: number;
    };
}>;
export declare const BASE_CURRENCY_CONSTANT = "JPY";
export {};
