/**
 * Table controls component for column visibility and filtering
 * Provides UI controls for managing table display options
 */

import React from 'react';
import { Table } from '@tanstack/react-table';
import { Position } from '../../types/portfolio';
import { ELEMENT_IDS } from './tableConfig';

interface TableControlsProps {
    table: Table<Position>;
    filterText: string;
    setFilterText: (text: string) => void;
    isColumnMenuOpen: boolean;
    setIsColumnMenuOpen: (open: boolean) => void;
    handleColumnMenuKeyDown: (event: React.KeyboardEvent) => void;
}

/**
 * Renders the table control interface including column visibility menu and filter input
 * @param props - Component props containing table instance and state handlers
 * @returns JSX element with column menu and filter controls
 */
export const TableControls: React.FC<TableControlsProps> = ({
    table,
    filterText,
    setFilterText,
    isColumnMenuOpen,
    setIsColumnMenuOpen,
    handleColumnMenuKeyDown,
}) => {
    return (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            {/* Column Visibility Menu */}
            <div className="relative">
                <button
                    id={ELEMENT_IDS.COLUMN_BUTTON}
                    onClick={() => setIsColumnMenuOpen(!isColumnMenuOpen)}
                    onKeyDown={handleColumnMenuKeyDown}
                    className="px-4 py-2 text-gray-900 bg-white border rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    aria-expanded={isColumnMenuOpen}
                    aria-controls={ELEMENT_IDS.COLUMN_MENU}
                >
                    Columns
                </button>
                
                {isColumnMenuOpen && (
                    <div
                        id={ELEMENT_IDS.COLUMN_MENU}
                        className="absolute mt-2 w-48 bg-white border rounded-lg shadow-lg z-10"
                        role="menu"
                        aria-labelledby={ELEMENT_IDS.COLUMN_BUTTON}
                    >
                        <div className="py-1">
                            {/* Show All Button */}
                            <button
                                className="w-full px-4 py-2 text-left text-sm text-gray-900 hover:bg-gray-100 focus:outline-none focus:bg-gray-100"
                                onClick={() => table.toggleAllColumnsVisible(true)}
                            >
                                Show All
                            </button>
                            
                            {/* Hide All Button */}
                            <button
                                className="w-full px-4 py-2 text-left text-sm text-gray-900 hover:bg-gray-100 focus:outline-none focus:bg-gray-100"
                                onClick={() => table.toggleAllColumnsVisible(false)}
                            >
                                Hide All
                            </button>
                            
                            <div className="h-px bg-gray-200 my-1" />
                            
                            {/* Individual Column Toggles */}
                            {table.getAllColumns().map(column => (
                                <label
                                    key={column.id}
                                    className="flex items-center px-4 py-2 text-gray-900 hover:bg-gray-100 cursor-pointer"
                                >
                                    <input
                                        type="checkbox"
                                        checked={column.getIsVisible()}
                                        onChange={column.getToggleVisibilityHandler()}
                                        className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    {String(column.columnDef.header)}
                                </label>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            
            {/* Filter Input */}
            <input
                type="text"
                placeholder="Filter by ticker, name, or account..."
                className="w-full sm:w-auto px-4 py-2 text-gray-900 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
            />
        </div>
    );
};
