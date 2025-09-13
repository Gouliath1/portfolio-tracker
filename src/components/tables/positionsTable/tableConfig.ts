/**
 * Table configuration constants and default settings
 * Centralizes all table-related configuration for easy maintenance
 */

import type { VisibilityState, ColumnSizingState } from '@tanstack/react-table';

/**
 * Default column sizes for the positions table
 * Defines the initial width for each column in pixels
 */
export const defaultColumnSizing: ColumnSizingState = {
    transactionDate: 100,
    ticker: 100,
    fullName: 150,
    broker: 140,
    account: 100,
    quantity: 100,
    costPerUnit: 120,
    totalCost: 120,
    currentPrice: 120,
    transactionFxRate: 120,
    currentFxRate: 120,
    costInJPY: 130,
    currentValueJPY: 130,
    pnlJPY: 130,
    pnlPercentage: 100,
    annualizedReturn: 100,
};

/**
 * Default column visibility settings
 * FX rate columns are hidden by default as they're advanced features
 */
export const defaultColumnVisibility: VisibilityState = {
    transactionFxRate: false,
    currentFxRate: false,
};

/**
 * Local storage keys for persisting user preferences
 */
export const STORAGE_KEYS = {
    COLUMN_VISIBILITY: 'columnVisibility',
    COLUMN_SIZING: 'columnSizing',
} as const;

/**
 * DOM element IDs used for event handling and accessibility
 */
export const ELEMENT_IDS = {
    COLUMN_MENU: 'column-menu',
    COLUMN_BUTTON: 'column-button',
} as const;