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
        baseCurrency: string;
        onDeleteRow?: (position: Position) => void;
        onSellRow?: (position: Position) => void;
        isDemoSet?: boolean;
    }
}

interface PositionsTableProps {
    positions: Position[];
    showValues: boolean;
    baseCurrency?: string;
    onDeletePosition?: (position: Position) => void;
    onSellPosition?: (position: Position) => void;
    isDemoSet?: boolean;
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
export const PositionsTable = ({ positions, showValues, baseCurrency = 'JPY', onDeletePosition, onSellPosition, isDemoSet = false }: PositionsTableProps) => {
    // Track narrow viewports so we can pin fewer columns and render compactly.
    // On mobile, pinning the 4 default columns (~304px) exceeds the container
    // width, leaving no room to scroll the rest of the data into view.
    const [isMobile, setIsMobile] = React.useState(false);
    React.useEffect(() => {
        const mq = window.matchMedia('(max-width: 767px)');
        const update = () => setIsMobile(mq.matches);
        update();
        mq.addEventListener('change', update);
        return () => mq.removeEventListener('change', update);
    }, []);

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
    const columns = createTableColumns({ showDelete: !isDemoSet, showSell: !isDemoSet && !!onSellPosition });

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
            columnPinning: { left: isMobile ? ['ticker'] : ['delete', 'sell', 'transactionDate', 'ticker'] },
        },
        meta: {
            showValues,
            baseCurrency,
            onDeleteRow: onDeletePosition ? (pos: Position) => onDeletePosition(pos) : undefined,
            onSellRow: onSellPosition ? (pos: Position) => onSellPosition(pos) : undefined,
            isDemoSet,
        },
        onSortingChange: setSorting,
        onColumnVisibilityChange: setColumnVisibility,
        onColumnSizingChange: setColumnSizing,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        columnResizeMode: 'onChange' as ColumnResizeMode,
    });

    return (
        <div className="glass rounded-2xl p-3 sm:p-6 flex flex-col gap-4 h-full">
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
            <div className="flex-1 min-h-0">
                <TableContent table={table} />
            </div>
        </div>
    );
};
