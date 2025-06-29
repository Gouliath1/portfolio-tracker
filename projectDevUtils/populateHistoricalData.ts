// Script to populate sample historical price data
// This demonstrates the new historical price structure

import { promises as fs } from 'fs';
import path from 'path';

interface HistoricalPriceData {
    lastUpdated: string;
    currentPrices: { [symbol: string]: number };
    historicalPrices: { [date: string]: { [symbol: string]: number } };
}

const HISTORICAL_PRICES_FILE = path.join(process.cwd(), 'src', 'data', 'dailyPrices.json');

// Generate sample historical data for the past year
function generateSampleHistoricalData(): HistoricalPriceData {
    const today = new Date();
    const symbols = ['7940.T', '8604.T', '8953.T', '8966.T', '3465.T', '4246.T', 'NVDA', '8897.T', '8986.T', 'AAPL'];
    
    // Current prices (as in the existing file)
    const currentPrices: { [symbol: string]: number } = {
        '7940.T': 593,
        '8604.T': 944.5,
        '8953.T': 102700,
        '8966.T': 136200,
        '3465.T': 4635,
        '4246.T': 649,
        'NVDA': 157.75,
        '8897.T': 379,
        '8986.T': 96800,
        'AAPL': 201.08
    };
    
    const historicalPrices: { [date: string]: { [symbol: string]: number } } = {};
    
    // Generate monthly data for the past 2 years
    for (let monthsBack = 0; monthsBack <= 24; monthsBack++) {
        const date = new Date(today.getFullYear(), today.getMonth() - monthsBack, 1);
        const dateStr = date.toISOString().split('T')[0];
        
        historicalPrices[dateStr] = {};
        
        symbols.forEach(symbol => {
            const currentPrice = currentPrices[symbol] || 100;
            
            // Generate some realistic price variation (±20% from current price)
            // More recent prices should be closer to current prices
            const variationFactor = 0.2 * (monthsBack / 24); // 0 to 20% variation
            const randomVariation = (Math.random() - 0.5) * 2 * variationFactor;
            const historicalPrice = currentPrice * (1 + randomVariation);
            
            // Round to appropriate decimal places
            if (symbol.includes('.T')) {
                // Japanese stocks - round to whole numbers
                historicalPrices[dateStr][symbol] = Math.round(historicalPrice);
            } else {
                // US stocks - round to 2 decimal places
                historicalPrices[dateStr][symbol] = Math.round(historicalPrice * 100) / 100;
            }
        });
    }
    
    return {
        lastUpdated: today.toISOString().split('T')[0],
        currentPrices,
        historicalPrices
    };
}

async function populateHistoricalData() {
    try {
        const data = generateSampleHistoricalData();
        await fs.writeFile(HISTORICAL_PRICES_FILE, JSON.stringify(data, null, 2));
        console.log('Historical price data populated successfully!');
        console.log(`Generated data for ${Object.keys(data.historicalPrices).length} dates`);
        console.log(`Covering ${Object.keys(data.currentPrices).length} symbols`);
    } catch (error) {
        console.error('Error populating historical data:', error);
    }
}

// Run the script
populateHistoricalData();
