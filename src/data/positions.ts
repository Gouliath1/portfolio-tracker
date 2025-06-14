import { RawPosition } from '../types/portfolio';
import fs from 'fs';
import path from 'path';

// Try to load local positions file, fall back to template if it doesn't exist
let positionsData;
const localPositionsPath = path.join(process.cwd(), 'src/data/positions.json');
const templatePositionsPath = path.join(process.cwd(), 'src/data/positions.template.json');

try {
    positionsData = JSON.parse(fs.readFileSync(localPositionsPath, 'utf8'));
    console.log('Using local positions data');
} catch (error) {
    positionsData = JSON.parse(fs.readFileSync(templatePositionsPath, 'utf8'));
    console.log('Using template positions data');
    
    // Copy template to positions.json if it doesn't exist
    if (!fs.existsSync(localPositionsPath)) {
        fs.copyFileSync(templatePositionsPath, localPositionsPath);
        console.log('Created local positions.json from template');
    }
}

// Convert any numeric tickers to strings
export const rawPositions: RawPosition[] = positionsData.positions.map(pos => ({
    ...pos,
    ticker: pos.ticker.toString()
}));
