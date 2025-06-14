'use client';

import { Position } from '../types/portfolio';

interface PositionsTableProps {
    positions: Position[];
}

export const PositionsTable = ({ positions }: PositionsTableProps) => {
    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ticker</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cost (JPY)</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Value (JPY)</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PnL (JPY)</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PnL %</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {positions.map((position, index) => (
                        <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{position.date}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{position.ticker}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{position.fullName}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{position.quantity}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{position.totalCost.toLocaleString()}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{position.totalValue.toLocaleString()}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{position.pnlJPY.toLocaleString()}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{position.pnlPercentage.toFixed(2)}%</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
