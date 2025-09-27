/**
 * Data filtering utilities for the positions table
 * Handles search and filter logic for table data
 */

import { useMemo } from 'react';
import { Position } from '@portfolio/types';

/**
 * Custom hook for filtering positions data based on search text
 * Searches across ticker, full name, and account fields (case-insensitive)
 * @param positions - Array of position objects to filter
 * @param filterText - Search text to filter by
 * @returns Filtered array of positions matching search criteria
 */
export function useFilteredPositions(positions: Position[], filterText: string) {
    return useMemo(() => {
        if (!filterText) return positions;
        
        const searchText = filterText.toLowerCase();
        return positions.filter(pos => 
            pos.ticker.toString().toLowerCase().includes(searchText) ||
            pos.fullName.toLowerCase().includes(searchText) ||
            pos.account.toLowerCase().includes(searchText)
        );
    }, [positions, filterText]);
}

/**
 * Validates if a position matches the search criteria
 * @param position - Position object to check
 * @param searchText - Search text (already lowercased)
 * @returns Boolean indicating if position matches search criteria
 */
export function matchesSearchCriteria(position: Position, searchText: string): boolean {
    return (
        position.ticker.toString().toLowerCase().includes(searchText) ||
        position.fullName.toLowerCase().includes(searchText) ||
        position.account.toLowerCase().includes(searchText)
    );
}
