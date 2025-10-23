export interface FxRateQueryOptions {
    date?: string;
}
export type FxRateSource = 'database' | 'file' | 'none';
export interface FxRateResult {
    pair: string;
    rate: number | null;
    date: string | null;
    requestedDate?: string;
    source: FxRateSource;
}
export declare const getFxRateWithFallback: (pair: string, options?: FxRateQueryOptions) => Promise<FxRateResult>;
export declare const updateFxRate: (pair: string, rate: number, date?: string) => Promise<void>;
