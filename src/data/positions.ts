import { RawPosition } from '../types/portfolio';

// In development, we'll use the local positions.json if it exists,
// otherwise fall back to the template
let positionsData;
try {
    positionsData = require('./positions.json');
    console.log('Using local positions data');
} catch (error) {
    positionsData = require('./positions.template.json');
    console.log('Using template positions data. Create a positions.json file based on positions.template.json to use your own data.');
}

// Convert any numeric tickers to strings
export const rawPositions: RawPosition[] = positionsData.positions.map((pos: { ticker: { toString: () => any; }; }) => ({
    ...pos,
    ticker: pos.ticker.toString()
}));
