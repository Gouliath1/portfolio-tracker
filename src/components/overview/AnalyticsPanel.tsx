'use client';

import { useMemo } from 'react';
import { PortfolioSummary } from '@portfolio/types';
import { useAssetClasses } from '../../hooks/useAssetClasses';
import { AssetAllocationCard } from './AssetAllocationCard';
import { TopHoldingsCard } from './TopHoldingsCard';

interface AnalyticsPanelProps {
    summary: PortfolioSummary;
    symbol: string;
    formatValue: (amount: number, showValues: boolean) => string;
    showValues: boolean;
}

// Right rail beside the P&L chart. Holds the two cards whose combined height
// roughly matches the chart so the row stays balanced; Benchmark and Portfolio
// Health live in a full-width row below the chart.
export const AnalyticsPanel = ({ summary, symbol, formatValue, showValues }: AnalyticsPanelProps) => {
    const tickers = useMemo(
        () => summary.positions.map(p => p.ticker),
        [summary.positions],
    );
    const { assetClasses, isLoading } = useAssetClasses(tickers);

    return (
        <div className="space-y-4">
            <AssetAllocationCard
                positions={summary.positions}
                assetClasses={assetClasses}
                totalValueJPY={summary.totalValueJPY}
                symbol={symbol}
                showValues={showValues}
                isLoading={isLoading}
            />
            <TopHoldingsCard
                positions={summary.positions}
                totalValueJPY={summary.totalValueJPY}
                formatValue={formatValue}
                showValues={showValues}
            />
        </div>
    );
};
