import { PortfolioSummary } from '@portfolio/types';
/**
 * Calculate annualized return for a position
 * @param totalReturn - Total return percentage
 * @param startDate - Transaction date string (YYYY/MM/DD format)
 * @returns Annualized return percentage or null if held less than 1 year
 */
export declare const calculateAnnualizedReturn: (totalReturn: number, startDate: string) => number | null;
/**
 * Calculate portfolio-level weighted annualized return with date information
 * @param summary - Portfolio summary containing positions
 * @returns Object with return percentage and earliest qualifying date, or null if no valid positions
 */
export declare const calculatePortfolioCagrSinceInception: (summary: PortfolioSummary) => {
    return: number;
    earliestDate: string;
} | null;
export declare const calculatePortfolioAnnualizedReturn: (summary: PortfolioSummary) => {
    return: number;
    earliestDate: string;
} | null;
