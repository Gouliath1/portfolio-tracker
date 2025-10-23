import { calculatePortfolioSummary } from '@portfolio/core';
import { getPositionsForActiveSet } from '../database/operations/positionsOperations';
const createEmptySummary = () => ({
    totalValueJPY: 0,
    totalCostJPY: 0,
    totalPnlJPY: 0,
    totalPnlPercentage: 0,
    positions: [],
});
export const getActivePositions = async () => {
    return getPositionsForActiveSet();
};
export const getActivePortfolioSnapshot = async (options = {}) => {
    var _a;
    const rawPositions = await getActivePositions();
    if (rawPositions.length === 0) {
        return {
            rawPositions,
            summary: createEmptySummary(),
            timestamp: new Date().toISOString(),
        };
    }
    const summary = await calculatePortfolioSummary(rawPositions, (_a = options.forceRefresh) !== null && _a !== void 0 ? _a : false);
    return {
        rawPositions,
        summary,
        timestamp: new Date().toISOString(),
    };
};
