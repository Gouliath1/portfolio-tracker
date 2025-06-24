'use client';

import { useEffect, useState, useMemo } from 'react';
import { fetchStockPrice } from '../../utils/stockApi';

export default function TestApi() {
    const [prices, setPrices] = useState<{[key: string]: number | null}>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const testStocks = useMemo(() => ['AAPL', 'NVDA', '8897.T', '8604.T', '7974.T'], []);

    useEffect(() => {
        async function fetchPrices() {
            try {
                const results: {[key: string]: number | null} = {};
                for (const symbol of testStocks) {
                    const price = await fetchStockPrice(symbol);
                    results[symbol] = price;
                }
                setPrices(results);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Unknown error');
            } finally {
                setLoading(false);
            }
        }

        fetchPrices();
    }, [testStocks]);

    if (loading) return <div>Loading...</div>;
    if (error) return <div>Error: {error}</div>;

    return (
        <div className="p-4">
            <h2 className="text-xl font-bold mb-4">Stock Price Test</h2>
            <div className="space-y-2">
                {testStocks.map(symbol => (
                    <div key={symbol} className="flex space-x-4">
                        <span className="font-medium">{symbol}:</span>
                        <span>{prices[symbol] ? `¥${prices[symbol]?.toLocaleString()}` : 'N/A'}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
