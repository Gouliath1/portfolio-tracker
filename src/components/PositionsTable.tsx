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
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Account</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cost/Unit</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Price</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cost (JPY)</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Value (JPY)</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">P&L (JPY)</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">P&L %</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {positions.map((position, index) => (
                        <tr key={`${position.ticker}-${index}`} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{position.transactionDate}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600 hover:text-blue-800">
                                <a href={`https://finance.yahoo.com/quote/${position.ticker}`} target="_blank" rel="noopener noreferrer">
                                    {position.ticker}
                                </a>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{position.fullName}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{position.account}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{position.quantity.toLocaleString()}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {position.baseCcy === 'JPY' ? '¥' : '$'}{position.costPerUnit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                {position.currentPrice === null ? (
                                    <span className="text-gray-400">Loading...</span>
                                ) : (
                                    <span className={`${position.currentPrice >= position.costPerUnit ? 'text-green-600' : 'text-red-600'}`}>
                                        {position.baseCcy === 'JPY' ? '¥' : '$'}{position.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">¥{position.costInJPY.toLocaleString()}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {position.currentPrice === null ? (
                                    <span className="text-gray-400">Loading...</span>
                                ) : (
                                    <>¥{position.currentValueJPY.toLocaleString()}</>
                                )}
                            </td>
                            <td className={`px-6 py-4 whitespace-nowrap text-sm ${position.currentPrice === null ? 'text-gray-400' : position.pnlJPY >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {position.currentPrice === null ? (
                                    'Loading...'
                                ) : (
                                    <>¥{position.pnlJPY.toLocaleString()}</>
                                )}
                            </td>
                            <td className={`px-6 py-4 whitespace-nowrap text-sm ${position.currentPrice === null ? 'text-gray-400' : position.pnlPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {position.currentPrice === null ? (
                                    'Loading...'
                                ) : (
                                    <>{position.pnlPercentage.toFixed(2)}%</>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
