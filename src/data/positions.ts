import { RawPosition } from '../types/portfolio';
import positionsData from './positions.json';

// Convert any numeric tickers to strings
export const rawPositions: RawPosition[] = positionsData.positions.map(pos => ({
    ...pos,
    ticker: pos.ticker.toString()
}));
