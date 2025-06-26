import { RawPosition } from '../types/portfolio';

// Function to load positions dynamically from API
export async function loadPositions(): Promise<RawPosition[]> {
    try {
        const response = await fetch('/api/positions');
        if (!response.ok) {
            throw new Error('Failed to load positions data');
        }
        const data = await response.json();
        return data.positions;
    } catch (error) {
        console.error('Error loading positions:', error);
        // Return empty array as fallback
        return [];
    }
}

// For backward compatibility, export an empty array initially
// This will be replaced by the dynamic loading in components
export const rawPositions: RawPosition[] = [];
