import { Position } from '@portfolio/types';
export interface HistoricalSnapshot {
    date: Date;
    totalValueJPY: number;
    totalCostJPY: number;
    pnlJPY: number;
    pnlPercentage: number;
    positionsCount: number;
    positionDetails?: PositionDetail[];
    cumulativePnlJPY: number;
    cumulativePnlPercentage: number;
}
export interface PositionDetail {
    ticker: string;
    fullName: string;
    quantity: number;
    costPerUnit: number;
    costInJPY: number;
    valueInJPY: number;
    pnlJPY: number;
    pnlPercentage: number;
    historicalPrice: number | null;
    transactionFxRate: number;
}
export declare function calculatePortfolioValueAtDate(positions: Position[], targetDate: Date, historicalPricesCache?: Map<string, {
    [date: string]: number;
}>, includeDetails?: boolean): Promise<HistoricalSnapshot>;
export declare function calculateHistoricalPortfolioValues(positions: Position[], dates: Date[], includeDetails?: boolean): Promise<HistoricalSnapshot[]>;
