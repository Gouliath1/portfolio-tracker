'use client';

import { useEffect, useRef } from 'react';
import { PortfolioSummary as PortfolioSummaryType } from '../types/portfolio';
import { calculatePortfolioAnnualizedReturn } from '../utils/returnCalculations';

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
    const portfolioAnnualizedReturn = calculatePortfolioAnnualizedReturn(summary);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-medium text-gray-900">Total Cost</h3>
                <p className="mt-2 text-3xl font-semibold text-gray-600">
                    {showValues ? 
                        <>¥{summary.totalCostJPY.toLocaleString()}</> :
                        <>¥{getHiddenValue(summary.totalCostJPY)}</>
                    }
                </p>
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
                                <>¥{summary.totalPnlJPY.toLocaleString()}</> :
                                <>¥{getHiddenValue(summary.totalPnlJPY)}</>
                        )}
                    </p>
                </div>
            </div>
            <div className="bg-white p-6 rounded-lg shadow relative overflow-hidden">
                <div className={`absolute inset-0 ${summary.totalPnlPercentage >= 0 ? 'bg-green-100' : 'bg-red-100'} transform scale-y-0 origin-bottom transition-transform duration-300 ${valueChanged ? 'scale-y-100' : ''}`} />
                <div className="relative">
                    <h3 className="text-lg font-medium text-gray-900">P&L %</h3>
                    <p className={`mt-2 text-3xl font-semibold ${hasNullPrices ? 'text-gray-400' : summary.totalPnlPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {hasNullPrices ? (
                            'Updating...'
                        ) : (
                            <>{summary.totalPnlPercentage.toFixed(2)}%</>
                        )}
                    </p>
                </div>
            </div>
            <div className="bg-white p-6 rounded-lg shadow relative overflow-hidden">
                <div className={`absolute inset-0 ${portfolioAnnualizedReturn !== null && portfolioAnnualizedReturn >= 0 ? 'bg-green-100' : 'bg-red-100'} transform scale-y-0 origin-bottom transition-transform duration-300 ${valueChanged ? 'scale-y-100' : ''}`} />
                <div className="relative">
                    <h3 className="text-lg font-medium text-gray-900">Annualized P&L %</h3>
                    <p className={`mt-2 text-3xl font-semibold ${hasNullPrices ? 'text-gray-400' : portfolioAnnualizedReturn === null ? 'text-gray-400' : portfolioAnnualizedReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {hasNullPrices ? (
                            'Updating...'
                        ) : portfolioAnnualizedReturn === null ? (
                            <span className="text-sm" title="Annualized return calculated for positions held 1+ years">-</span>
                        ) : (
                            <>{portfolioAnnualizedReturn.toFixed(2)}%</>
                        )}
                    </p>
                </div>
            </div>
        </div>
    );
};
