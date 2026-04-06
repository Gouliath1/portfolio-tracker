import React from 'react';
import { flexRender, Table } from '@tanstack/react-table';
import { Position } from '@portfolio/types';

interface TableContentProps {
    table: Table<Position>;
}

export const TableContent: React.FC<TableContentProps> = ({ table }) => {
    return (
        <div
            className="overflow-auto rounded-xl h-[calc(100vh-320px)]"
            style={{ border: '1px solid var(--border)' }}
        >
            <table
                className="min-w-full table-fixed"
                style={{ width: table.getCenterTotalSize() }}
            >
                {/* Header */}
                <thead className="sticky top-0 z-10" style={{ background: 'var(--table-header-bg)', backdropFilter: 'blur(12px)' }}>
                    {table.getHeaderGroups().map(headerGroup => (
                        <tr key={headerGroup.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            {headerGroup.headers.map(header => (
                                <th
                                    key={header.id}
                                    className="relative px-4 py-3 text-left text-xs font-medium uppercase tracking-widest cursor-pointer select-none"
                                    style={{ color: 'var(--text-muted)', width: header.getSize() }}
                                    onClick={header.column.getToggleSortingHandler()}
                                >
                                    <div className="flex items-center justify-between w-full">
                                        <span className="flex-1 min-w-0 pr-1">
                                            {flexRender(header.column.columnDef.header, header.getContext())}
                                        </span>
                                        <span className="ml-1 inline-block min-w-[14px] flex-shrink-0"
                                            style={{ color: 'var(--accent)' }}>
                                            {{ asc: '↑', desc: '↓' }[header.column.getIsSorted() as string] ?? ''}
                                        </span>
                                    </div>
                                    {/* Resize handle */}
                                    <div
                                        onMouseDown={header.getResizeHandler()}
                                        onTouchStart={header.getResizeHandler()}
                                        className={`absolute right-0 top-0 h-full w-2 cursor-col-resize select-none touch-none opacity-0 hover:opacity-100 transition-opacity ${
                                            header.column.getIsResizing() ? 'opacity-100' : ''
                                        }`}
                                    >
                                        <div className="absolute right-[3px] h-full w-px"
                                            style={{ background: header.column.getIsResizing() ? 'var(--accent)' : 'var(--border)' }} />
                                    </div>
                                </th>
                            ))}
                        </tr>
                    ))}
                </thead>

                {/* Body */}
                <tbody>
                    {table.getRowModel().rows.map((row, i) => (
                        <tr
                            key={row.id}
                            className="transition-colors group"
                            style={{
                                borderBottom: '1px solid var(--border)',
                                background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--glass-hover)')}
                            onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)')}
                        >
                            {row.getVisibleCells().map(cell => (
                                <td
                                    key={cell.id}
                                    className="px-4 py-3 text-sm truncate tabular-nums"
                                    style={{ color: 'var(--text-primary)', width: cell.column.getSize() }}
                                >
                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>

            {table.getRowModel().rows.length === 0 && (
                <div className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>
                    No positions match your filter
                </div>
            )}
        </div>
    );
};
