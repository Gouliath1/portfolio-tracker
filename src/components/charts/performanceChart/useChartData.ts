import { useState, useEffect, useCallback } from 'react';
import { Position } from '@portfolio/types';
import { calculateHistoricalPortfolioValues, HistoricalSnapshot } from '../../../utils/historicalPortfolioCalculations';
import { TimelineFilter, generateDateIntervals } from './chartUtils';

export const useChartData = (positions: Position[], selectedTimeline: TimelineFilter) => {
    const [historicalData, setHistoricalData] = useState<HistoricalSnapshot[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const calculateHistoricalData = useCallback(async () => {
        if (positions.length === 0) {
            setHistoricalData([]);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const dateIntervals = generateDateIntervals(selectedTimeline, positions);
            const snapshots = await calculateHistoricalPortfolioValues(positions, dateIntervals, true);
            setHistoricalData(snapshots);
        } catch (err) {
            console.error('Error calculating historical data:', err);
            setError('Failed to calculate historical portfolio data');
            setHistoricalData([]);
        } finally {
            setIsLoading(false);
        }
    }, [positions, selectedTimeline]);

    useEffect(() => {
        calculateHistoricalData();
    }, [calculateHistoricalData]);

    return {
        historicalData,
        isLoading,
        error
    };
};
