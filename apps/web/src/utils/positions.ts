import { RawPosition } from '@portfolio/types';

// Function to load positions dynamically from API
// Gracefully handles errors and returns empty array to prevent UI failures
export async function loadPositions(): Promise<RawPosition[]> {
    try {
        const response = await fetch('/api/positions');
        const data = await response.json();

        // API returns {positions: [], message?: string} format
        // Return positions array whether it's empty or has data
        return Array.isArray(data.positions) ? data.positions : [];
    } catch (error) {
        console.warn('[loadPositions] Unable to load positions, returning empty array:', error);
        // Return empty array as fallback to prevent UI failure
        return [];
    }
}

// For backward compatibility, export an empty array initially
// This will be replaced by the dynamic loading in components
export const rawPositions: RawPosition[] = [];
