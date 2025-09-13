/**
 * Table state management utilities
 * Handles localStorage persistence and state initialization for table preferences
 */

import { useState, useEffect, useCallback } from 'react';
import { SortingState, VisibilityState, ColumnSizingState } from '@tanstack/react-table';
import { defaultColumnVisibility, defaultColumnSizing, STORAGE_KEYS, ELEMENT_IDS } from './tableConfig';

/**
 * Custom hook for managing table state with localStorage persistence
 * Handles sorting, column visibility, column sizing, filtering, and menu state
 * @returns Object containing all state variables and setters
 */
export function useTableState() {
    // Table data state with default sorting by transaction date (oldest first)
    const [sorting, setSorting] = useState<SortingState>([{ id: 'transactionDate', desc: false }]);
    const [filterText, setFilterText] = useState('');
    const [isColumnMenuOpen, setIsColumnMenuOpen] = useState(false);

    // Column visibility state with localStorage persistence
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => {
        const saved = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.COLUMN_VISIBILITY) : null;
        return saved ? JSON.parse(saved) : defaultColumnVisibility;
    });

    // Column sizing state with localStorage persistence
    const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(() => {
        const saved = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.COLUMN_SIZING) : null;
        return saved ? JSON.parse(saved) : defaultColumnSizing;
    });

    /**
     * Saves column visibility state to localStorage whenever it changes
     * Enables persistent column preferences across browser sessions
     */
    useEffect(() => {
        localStorage.setItem(STORAGE_KEYS.COLUMN_VISIBILITY, JSON.stringify(columnVisibility));
    }, [columnVisibility]);

    /**
     * Saves column sizing state to localStorage whenever it changes
     * Enables persistent column width preferences across browser sessions
     */
    useEffect(() => {
        localStorage.setItem(STORAGE_KEYS.COLUMN_SIZING, JSON.stringify(columnSizing));
    }, [columnSizing]);

    /**
     * Handles clicking outside the column menu to close it
     * Adds event listener for mousedown events and checks if click is outside menu
     */
    useEffect(() => {
        /**
         * Event handler for mouse clicks outside the column menu
         * Closes the column menu if click occurs outside both menu and button
         * @param event - Mouse event object
         */
        const handleClickOutside = (event: MouseEvent) => {
            const columnMenu = document.getElementById(ELEMENT_IDS.COLUMN_MENU);
            const columnButton = document.getElementById(ELEMENT_IDS.COLUMN_BUTTON);
            if (
                columnMenu &&
                !columnMenu.contains(event.target as Node) &&
                !columnButton?.contains(event.target as Node)
            ) {
                setIsColumnMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    /**
     * Handles keyboard navigation for the column menu
     * Closes menu when Escape key is pressed for accessibility
     * @param event - Keyboard event object
     */
    const handleColumnMenuKeyDown = useCallback((event: React.KeyboardEvent) => {
        if (event.key === 'Escape') {
            setIsColumnMenuOpen(false);
        }
    }, []);

    return {
        // State variables
        sorting,
        columnVisibility,
        columnSizing,
        filterText,
        isColumnMenuOpen,

        // State setters
        setSorting,
        setColumnVisibility,
        setColumnSizing,
        setFilterText,
        setIsColumnMenuOpen,

        // Event handlers
        handleColumnMenuKeyDown,
    };
}
