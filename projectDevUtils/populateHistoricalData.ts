// Script to populate sample historical price data
// This demonstrates the existing price structure used by the portfolio tracker

import { promises as fs } from 'fs';
import path from 'path';

// Structure: { [symbol: string]: { [date: string]: number } }
type PriceData = { [symbol: string]: { [date: string]: number } };

const PRICES_FILE = path.join(process.cwd(), 'src', 'data', 'positionsPrices.json');

// Generate sample historical data for the past year
function generateSampleHistoricalData(): PriceData {
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
    
    const priceData: PriceData = {};
    
    // Initialize each symbol
    symbols.forEach(symbol => {
        priceData[symbol] = {};
    });
    
    // Generate monthly data for the past 2 years
    for (let monthsBack = 0; monthsBack <= 24; monthsBack++) {
        const date = new Date(today.getFullYear(), today.getMonth() - monthsBack, 1);
        const dateStr = date.toISOString().split('T')[0];
        
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
                priceData[symbol][dateStr] = Math.round(historicalPrice);
            } else {
                // US stocks - round to 2 decimal places
                priceData[symbol][dateStr] = Math.round(historicalPrice * 100) / 100;
            }
        });
    }
    
    // Sort dates for each symbol (newest first, as in existing file)
    symbols.forEach(symbol => {
        const sortedDates = Object.keys(priceData[symbol]).sort((a, b) => b.localeCompare(a));
        const sortedPrices: { [date: string]: number } = {};
        sortedDates.forEach(date => {
            sortedPrices[date] = priceData[symbol][date];
        });
        priceData[symbol] = sortedPrices;
    });
    
    return priceData;
}

async function populateHistoricalData() {
    try {
        const data = generateSampleHistoricalData();
        await fs.writeFile(PRICES_FILE, JSON.stringify(data, null, 2));
        console.log('Historical price data populated successfully!');
        console.log(`Generated data for ${Object.keys(data).length} symbols`);
        console.log(`Each symbol has historical data for multiple dates`);
    } catch (error) {
        console.error('Error populating historical data:', error);
    }
}

// Run the script
populateHistoricalData();
