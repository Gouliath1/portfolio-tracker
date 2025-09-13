/**
 * Table content component for rendering the actual data table
 * Handles the table structure, headers, rows, and interactions
 */

import React from 'react';
import { flexRender, Table } from '@tanstack/react-table';
import { Position } from '../../../types/portfolio';

interface TableContentProps {
    table: Table<Position>;
}

/**
 * Renders the main table content with headers, rows, and resize handles
 * Includes sticky headers, hover effects, and column resizing functionality
 * @param props - Component props containing the configured table instance
 * @returns JSX element with the complete table structure
 */
export const TableContent: React.FC<TableContentProps> = ({ table }) => {
    return (
        <div className="overflow-auto border rounded-lg h-[calc(100vh-280px)] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-track]:bg-gray-100">
            <table 
                className="min-w-full divide-y divide-gray-200 table-fixed" 
                style={{ width: table.getCenterTotalSize() }}
            >
                {/* Table Header */}
                <thead className="bg-gray-50 sticky top-0 z-10">
                    {table.getHeaderGroups().map(headerGroup => (
                        <tr key={headerGroup.id}>
                            {headerGroup.headers.map(header => (
                                <th
                                    key={header.id}
                                    className="relative px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider cursor-pointer select-none"
                                    onClick={header.column.getToggleSortingHandler()}
                                    style={{ width: header.getSize() }}
                                >
                                    {/* Header Content with Sort Indicator */}
                                    <div className="flex items-center justify-between w-full">
                                        <span className="flex-1 min-w-0 pr-1">
                                            {flexRender(header.column.columnDef.header, header.getContext())}
                                        </span>
                                        <span className="ml-1 inline-block min-w-[16px] flex-shrink-0">
                                            {{
                                                asc: '↑',
                                                desc: '↓',
                                            }[header.column.getIsSorted() as string] ?? ''}
                                        </span>
                                    </div>
                                    
                                    {/* Column Resize Handle */}
                                    <div
                                        onMouseDown={header.getResizeHandler()}
                                        onTouchStart={header.getResizeHandler()}
                                        className={`absolute right-0 top-0 h-full w-2 cursor-col-resize select-none touch-none opacity-0 hover:opacity-100 transition-opacity group ${
                                            header.column.getIsResizing() ? 'opacity-100 bg-blue-500' : ''
                                        }`}
                                    >
                                        <div className="absolute right-[3px] h-full w-px bg-gray-300 group-hover:bg-blue-500 transition-colors" />
                                    </div>
                                </th>
                            ))}
                        </tr>
                    ))}
                </thead>
                
                {/* Table Body */}
                <tbody className="bg-white divide-y divide-gray-200">
                    {table.getRowModel().rows.map(row => (
                        <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                            {row.getVisibleCells().map(cell => (
                                <td
                                    key={cell.id}
                                    className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 truncate"
                                    style={{ width: cell.column.getSize() }}
                                >
                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
            
            {/* Empty State */}
            {table.getRowModel().rows.length === 0 && (
                <div className="text-center py-4 text-gray-500">
                    No positions match your filter criteria
                </div>
            )}
        </div>
    );
};
