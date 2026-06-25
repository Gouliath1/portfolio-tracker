import React from 'react';
import { flexRender, Table } from '@tanstack/react-table';
import { Position } from '@portfolio/types';

interface TableContentProps {
    table: Table<Position>;
}

export const TableContent: React.FC<TableContentProps> = ({ table }) => {
    return (
        <div className="overflow-auto overscroll-contain rounded-xl max-h-[calc(100vh-320px)]">
            <table
                className="min-w-full table-fixed data-table"
                style={{ width: table.getCenterTotalSize() }}
            >
                {/* Header */}
                <thead className="sticky top-0 z-10" style={{ background: 'var(--table-header-bg)', backdropFilter: 'blur(12px)' }}>
                    {table.getHeaderGroups().map(headerGroup => (
                        <tr key={headerGroup.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            {headerGroup.headers.map(header => {
                                const isAction = header.id === 'sell' || header.id === 'delete';
                                const isPinned = header.column.getIsPinned() === 'left';
                                return (
                                <th
                                    key={header.id}
                                    className={isAction
                                        ? 'relative px-1 py-2 sm:py-3 text-left text-xs font-semibold uppercase tracking-widest select-none'
                                        : 'relative px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-semibold uppercase tracking-widest cursor-pointer select-none'}
                                    style={{
                                        color: 'var(--text-muted)',
                                        width: header.getSize(),
                                        ...(isPinned && {
                                            position: 'sticky',
                                            left: header.column.getStart('left'),
                                            zIndex: 12,
                                            background: 'var(--table-header-bg)',
                                        }),
                                    }}
                                    onClick={isAction ? undefined : header.column.getToggleSortingHandler()}
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
                                );
                            })}
                        </tr>
                    ))}
                </thead>

                {/* Body */}
                <tbody>
                    {table.getRowModel().rows.map((row, i) => (
                        <tr
                            key={row.id}
                            className="group"
                            style={{ borderBottom: '1px solid var(--border)' }}
                        >
                            {row.getVisibleCells().map(cell => {
                                const isAction = cell.column.id === 'sell' || cell.column.id === 'delete';
                                const isPinned = cell.column.getIsPinned() === 'left';
                                return (
                                    <td
                                        key={cell.id}
                                        className={isAction
                                            ? 'px-1 py-1.5 sm:py-2 text-xs sm:text-sm'
                                            : 'px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm truncate'}
                                        style={{
                                            color: 'var(--text-primary)',
                                            width: cell.column.getSize(),
                                            ...(isPinned && {
                                                position: 'sticky',
                                                left: cell.column.getStart('left'),
                                                zIndex: 1,
                                                background: 'var(--surface-popover)',
                                            }),
                                        }}
                                    >
                                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>

                {/* Footer with totals — sums reflect the active filter */}
                {table.getRowModel().rows.length > 0 && (
                    <tfoot
                        className="sticky bottom-0 z-10"
                        style={{ background: 'var(--table-header-bg)', backdropFilter: 'blur(12px)' }}
                    >
                        {table.getFooterGroups().map(footerGroup => (
                            <tr key={footerGroup.id} style={{ borderTop: '1px solid var(--border)' }}>
                                {footerGroup.headers.map(header => {
                                    const isAction = header.id === 'sell' || header.id === 'delete';
                                    const isPinned = header.column.getIsPinned() === 'left';
                                    return (
                                        <td
                                            key={header.id}
                                            className={isAction
                                                ? 'px-1 py-2 sm:py-3 text-xs sm:text-sm font-semibold'
                                                : 'px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-semibold tabular-nums'}
                                            style={{
                                                color: 'var(--text-primary)',
                                                width: header.getSize(),
                                                ...(isPinned && {
                                                    position: 'sticky',
                                                    left: header.column.getStart('left'),
                                                    zIndex: 12,
                                                    background: 'var(--table-header-bg)',
                                                }),
                                            }}
                                        >
                                            {header.isPlaceholder
                                                ? null
                                                : flexRender(header.column.columnDef.footer, header.getContext())}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tfoot>
                )}
            </table>

            {table.getRowModel().rows.length === 0 && (
                <div className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>
                    No positions match your filter
                </div>
            )}
        </div>
    );
};
