export interface PriceLookupOptions {
    forceRefresh?: boolean;
}
export type PriceSource = 'database' | 'fresh';
export interface PriceLookupResult {
    symbol: string;
    price: number | null;
    date: string | null;
    source: PriceSource;
}
export declare const getLatestPriceForSymbol: (symbol: string, options?: PriceLookupOptions) => Promise<PriceLookupResult>;
export declare const storePriceForSymbol: (symbol: string, price: number, date?: string) => Promise<void>;
