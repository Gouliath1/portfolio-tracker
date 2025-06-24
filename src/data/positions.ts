import { RawPosition } from '../types/portfolio';
import positionsTemplate from './positions.template.json';

// In development, we'll use the local positions.json if it exists,
// otherwise fall back to the template
let positionsData;
try {
    // Try to import local positions.json, fallback to template if not found
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    positionsData = require('./positions.json');
    console.log('Using local positions data');
} catch {
    positionsData = positionsTemplate;
    console.log('Using template positions data. Create a positions.json file based on positions.template.json to use your own data.');
}

// Convert any numeric tickers to strings
export const rawPositions: RawPosition[] = positionsData.positions.map((pos: { ticker: { toString: () => string; }; }) => ({
    ...pos,
    ticker: pos.ticker.toString()
}));
