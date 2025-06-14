import { Position, PortfolioSummary } from '../types/portfolio';

export const calculatePortfolioSummary = (positions: Position[]): PortfolioSummary => {
    const totalValueJPY = positions.reduce((sum, pos) => sum + pos.totalValue, 0);
    const totalCostJPY = positions.reduce((sum, pos) => sum + pos.totalCost, 0);
    const totalPnlJPY = totalValueJPY - totalCostJPY;
    const totalPnlPercentage = (totalPnlJPY / totalCostJPY) * 100;

    return {
        totalValueJPY,
        totalCostJPY,
        totalPnlJPY,
        totalPnlPercentage,
        positions
    };
};
