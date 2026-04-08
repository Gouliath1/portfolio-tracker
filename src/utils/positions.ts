import { RawPosition } from '@portfolio/types';
import { DEMO_POSITIONS } from '../data/demoPositions';

export async function loadPositions(): Promise<RawPosition[]> {
    if (typeof window === 'undefined') return [];
    try {
        const { getActivePositions } = await import('./localPositions');
        return getActivePositions();
    } catch {
        return DEMO_POSITIONS;
    }
}

// Kept for backward compatibility
export const rawPositions: RawPosition[] = [];
