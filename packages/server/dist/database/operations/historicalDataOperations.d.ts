export interface HistoricalDataStatus {
    needsRefresh: boolean;
    missingDays: number;
    lastDataDate: string | null;
    reason: string;
}
export declare const getHistoricalDataStatus: () => Promise<HistoricalDataStatus>;
