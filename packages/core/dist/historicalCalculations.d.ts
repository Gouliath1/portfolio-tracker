import { RawPosition, HistoricalPortfolioSnapshot } from '@portfolio/types';
interface MonthlyPortfolio {
    positions: RawPosition[];
    date: Date;
    totalCost: number;
}
export declare function generateMonthlyDates(startDate: Date, endDate?: Date): Date[];
export declare function getPortfolioStateAtDate(positions: RawPosition[], targetDate: Date): MonthlyPortfolio;
export declare function calculateHistoricalSnapshots(positions: RawPosition[], startDate?: Date): MonthlyPortfolio[];
export declare function fetchHistoricalPrices(symbol: string, dates: Date[]): Promise<{
    [date: string]: number;
}>;
export declare function calculateHistoricalValues(positions: RawPosition[]): Promise<HistoricalPortfolioSnapshot[]>;
export {};
