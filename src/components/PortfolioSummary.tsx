'use client';

import { PortfolioSummary as PortfolioSummaryType } from '../types/portfolio';

interface PortfolioSummaryProps {
    summary: PortfolioSummaryType;
}

export const PortfolioSummary = ({ summary }: PortfolioSummaryProps) => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-medium text-gray-900">Total Value</h3>
                <p className="mt-2 text-3xl font-semibold text-indigo-600">
                    ¥{summary.totalValueJPY.toLocaleString()}
                </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-medium text-gray-900">Total Cost</h3>
                <p className="mt-2 text-3xl font-semibold text-gray-600">
                    ¥{summary.totalCostJPY.toLocaleString()}
                </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-medium text-gray-900">Total P&L</h3>
                <p className={`mt-2 text-3xl font-semibold ${summary.totalPnlJPY >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ¥{summary.totalPnlJPY.toLocaleString()}
                </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-medium text-gray-900">P&L %</h3>
                <p className={`mt-2 text-3xl font-semibold ${summary.totalPnlPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {summary.totalPnlPercentage.toFixed(2)}%
                </p>
            </div>
        </div>
    );
};
