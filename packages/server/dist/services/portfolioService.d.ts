import { PortfolioSummary, RawPosition } from '@portfolio/types';
export interface PortfolioSnapshotOptions {
    forceRefresh?: boolean;
}
export interface PortfolioSnapshot {
    summary: PortfolioSummary;
    rawPositions: RawPosition[];
    timestamp: string;
}
export declare const getActivePositions: () => Promise<RawPosition[]>;
export declare const getActivePortfolioSnapshot: (options?: PortfolioSnapshotOptions) => Promise<PortfolioSnapshot>;
