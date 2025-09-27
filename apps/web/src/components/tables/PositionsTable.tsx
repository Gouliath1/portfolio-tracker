'use client';

import React from 'react';
import {
    useReactTable,
    getCoreRowModel,
    getSortedRowModel,
    type ColumnResizeMode,
} from '@tanstack/react-table';
import { Position } from '@portfolio/types';
import { createTableColumns } from './positionsTable/columnDefinitions';
import { useTableState } from './positionsTable/tableState';
import { useFilteredPositions } from './positionsTable/dataUtils';
import { TableControls } from './positionsTable/TableControls';
import { TableContent } from './positionsTable/TableContent';

// Extend the TableMeta type from @tanstack/react-table
declare module '@tanstack/react-table' {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    interface TableMeta<TData> {
        showValues: boolean;
    }
}

interface PositionsTableProps {
    positions: Position[];
    showValues: boolean;
}

/**
 * Main PositionsTable component that displays portfolio positions in a sortable, filterable table
 * Features include:
 * - Sortable columns with persistent state
 * - Column visibility toggles with localStorage persistence
 * - Resizable columns with drag handles
 * - Real-time filtering by ticker, name, or account
 * - Value hiding/showing toggle
 * - Currency formatting with proper symbols and decimal places
 * - Color-coded P&L indicators
 * - Responsive design with sticky headers
 * @param positions - Array of position objects to display
 * @param showValues - Boolean to control value visibility (privacy mode)
 * @returns JSX element containing the complete positions table interface
 */
export const PositionsTable = ({ positions, showValues }: PositionsTableProps) => {
    // Use custom hooks for state management
    const {
        sorting,
        columnVisibility,
        columnSizing,
        filterText,
        isColumnMenuOpen,
        setSorting,
        setColumnVisibility,
        setColumnSizing,
        setFilterText,
        setIsColumnMenuOpen,
        handleColumnMenuKeyDown,
    } = useTableState();

    // Filter data based on search text
    const filteredData = useFilteredPositions(positions, filterText);

    // Get column definitions
    const columns = createTableColumns();

    /**
     * Creates and configures the react-table instance with all necessary options
     * Includes data, column definitions, state management, and meta information
     * Handles sorting, visibility, sizing, and resize functionality
     * @returns Configured table instance for rendering
     */
    const table = useReactTable({
        data: filteredData,
        columns,
        state: {
            sorting,
            columnVisibility,
            columnSizing,
        },
        meta: {
            showValues,
        },
        onSortingChange: setSorting,
        onColumnVisibilityChange: setColumnVisibility,
        onColumnSizingChange: setColumnSizing,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        columnResizeMode: 'onChange' as ColumnResizeMode,
    });

    return (
        <div className="space-y-4 h-full">
            {/* Table Controls */}
            <TableControls
                table={table}
                filterText={filterText}
                setFilterText={setFilterText}
                isColumnMenuOpen={isColumnMenuOpen}
                setIsColumnMenuOpen={setIsColumnMenuOpen}
                handleColumnMenuKeyDown={handleColumnMenuKeyDown}
            />

            {/* Table Content */}
            <TableContent table={table} />
        </div>
    );
};
