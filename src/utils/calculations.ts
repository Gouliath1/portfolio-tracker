import { Position, RawPosition, PortfolioSummary } from '../types/portfolio';

export const calculatePosition = (rawPosition: RawPosition): Position => {
    const costInJPY = rawPosition.quantity * rawPosition.costPerUnit * rawPosition.transactionFx;
    const currentValueJPY = rawPosition.quantity * rawPosition.currentCostInBaseCcy * 
        (rawPosition.baseCcy === 'JPY' ? 1 : rawPosition.transactionFx);
    const pnlJPY = currentValueJPY - costInJPY;
    const pnlPercentage = (pnlJPY / costInJPY) * 100;

    return {
        ...rawPosition,
        costInJPY,
        currentValueJPY,
        pnlJPY,
        pnlPercentage
    };
};

export const calculatePortfolioSummary = (rawPositions: RawPosition[]): PortfolioSummary => {
    const positions = rawPositions.map(calculatePosition);
    
    const totalCostJPY = positions.reduce((sum, pos) => sum + pos.costInJPY, 0);
    const totalValueJPY = positions.reduce((sum, pos) => sum + pos.currentValueJPY, 0);
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
