'use client';

import { useEffect, useRef } from 'react';
import { PortfolioSummary as PortfolioSummaryType } from '../../types/portfolio';
import { calculatePortfolioCagrSinceInception } from '../../utils/returnCalculations';

interface PortfolioSummaryProps {
    summary: PortfolioSummaryType;
    showValues: boolean;
}

const getHiddenValue = (value: number) => '•'.repeat(Math.min(8, Math.ceil(Math.log10(Math.abs(value) + 1))));

export const PortfolioSummary = ({ summary, showValues }: PortfolioSummaryProps) => {
    const prevSummary = useRef<PortfolioSummaryType>(summary);
    const valueChanged = summary.totalValueJPY !== prevSummary.current.totalValueJPY;

    useEffect(() => {
        prevSummary.current = summary;
    }, [summary]);

    const hasNullPrices = summary.positions.some(p => p.currentPrice === null);
    const portfolioAnnualizedReturn = calculatePortfolioCagrSinceInception(summary);

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-white p-6 rounded-lg shadow relative overflow-hidden">
                <div className={`absolute inset-0 ${summary.totalValueJPY >= summary.totalCostJPY ? 'bg-green-100' : 'bg-red-100'} transform scale-y-0 origin-bottom transition-transform duration-300 ${valueChanged ? 'scale-y-100' : ''}`} />
                <div className="relative">
                    <h3 className="text-lg font-medium text-gray-900">Total Value</h3>
                    <p className={`mt-2 text-3xl font-semibold ${hasNullPrices ? 'text-gray-400' : summary.totalValueJPY >= summary.totalCostJPY ? 'text-green-600' : 'text-red-600'}`}>
                        {hasNullPrices ? (
                            'Updating...'
                        ) : (
                            showValues ? 
                                <>¥{Math.round(summary.totalValueJPY).toLocaleString()}</> :
                                <>¥{getHiddenValue(summary.totalValueJPY)}</>
                        )}
                    </p>
                </div>
            </div>
            <div className="bg-white p-6 rounded-lg shadow relative overflow-hidden">
                <div className={`absolute inset-0 ${summary.totalPnlJPY >= 0 ? 'bg-green-100' : 'bg-red-100'} transform scale-y-0 origin-bottom transition-transform duration-300 ${valueChanged ? 'scale-y-100' : ''}`} />
                <div className="relative">
                    <h3 className="text-lg font-medium text-gray-900">Total P&L</h3>
                    <p className={`mt-2 text-3xl font-semibold ${hasNullPrices ? 'text-gray-400' : summary.totalPnlJPY >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {hasNullPrices ? (
                            'Updating...'
                        ) : (
                            showValues ? 
                                <>¥{Math.round(summary.totalPnlJPY).toLocaleString()}</> :
                                <>¥{getHiddenValue(summary.totalPnlJPY)}</>
                        )}
                    </p>
                    <p className={`text-sm mt-1 ${hasNullPrices ? 'text-gray-400' : summary.totalPnlPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {hasNullPrices ? '' : `${summary.totalPnlPercentage.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`}
                    </p>
                </div>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-medium text-gray-900">Total Cost</h3>
                <p className="mt-2 text-3xl font-semibold text-gray-600">
                    {showValues ? 
                        <>¥{Math.round(summary.totalCostJPY).toLocaleString()}</> :
                        <>¥{getHiddenValue(summary.totalCostJPY)}</>
                    }
                </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow relative overflow-hidden">
                <div className={`absolute inset-0 ${portfolioAnnualizedReturn !== null && portfolioAnnualizedReturn.return >= 0 ? 'bg-green-100' : 'bg-red-100'} transform scale-y-0 origin-bottom transition-transform duration-300 ${valueChanged ? 'scale-y-100' : ''}`} />
                <div className="relative">
                    <h3 className="text-lg font-medium text-gray-900">Annualized P&L %</h3>
                    <div className={`mt-2 ${hasNullPrices ? 'text-gray-400' : portfolioAnnualizedReturn === null ? 'text-gray-400' : portfolioAnnualizedReturn.return >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {hasNullPrices ? (
                            <div className="text-3xl font-semibold">Updating...</div>
                        ) : portfolioAnnualizedReturn === null ? (
                            <div className="text-3xl font-semibold" title="Annualized return calculated for positions held 1+ years">
                                <span className="text-sm">-</span>
                            </div>
                        ) : (
                            <>
                                <div className="text-3xl font-semibold">
                                    {portfolioAnnualizedReturn.return.toFixed(2)}%
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                    (since {formatDate(portfolioAnnualizedReturn.earliestDate)})
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
