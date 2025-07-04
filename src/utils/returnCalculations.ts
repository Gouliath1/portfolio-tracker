import { PortfolioSummary } from '../types/portfolio';

/**
 * Calculate annualized return for a position
 * @param totalReturn - Total return percentage
 * @param startDate - Transaction date string (YYYY/MM/DD format)
 * @returns Annualized return percentage or null if held less than 1 year
 */
export const calculateAnnualizedReturn = (totalReturn: number, startDate: string): number | null => {
    const start = new Date(startDate);
    const now = new Date();
    const years = (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    
    if (years < 1) {
        return null; // Return null for positions held less than a year
    }
    
    return (Math.pow(1 + (totalReturn / 100), 1/years) - 1) * 100;
};

/**
 * Calculate portfolio-level weighted annualized return
 * @param summary - Portfolio summary containing positions
 * @returns Weighted annualized return percentage or null if no valid positions
 */
export const calculatePortfolioAnnualizedReturn = (summary: PortfolioSummary): number | null => {
    if (summary.positions.length === 0) return null;
    
    let totalWeightedReturn = 0;
    let totalValidCost = 0;
    let hasAnyValidReturns = false;
    
    summary.positions.forEach(position => {
        const annualizedReturn = calculateAnnualizedReturn(position.pnlPercentage, position.transactionDate);
        
        if (annualizedReturn !== null && position.currentPrice !== null) {
            const weight = position.costInJPY;
            
            totalWeightedReturn += annualizedReturn * weight;
            totalValidCost += weight;
            hasAnyValidReturns = true;
        }
    });
    
    if (!hasAnyValidReturns || totalValidCost === 0) return null;
    
    return totalWeightedReturn / totalValidCost;
};
