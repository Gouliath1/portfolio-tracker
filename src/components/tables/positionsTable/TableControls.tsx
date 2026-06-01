import React from 'react';
import { Table } from '@tanstack/react-table';
import { Position } from '@portfolio/types';
import { ELEMENT_IDS } from './tableConfig';

interface TableControlsProps {
    table: Table<Position>;
    filterText: string;
    setFilterText: (text: string) => void;
    isColumnMenuOpen: boolean;
    setIsColumnMenuOpen: (open: boolean) => void;
    handleColumnMenuKeyDown: (event: React.KeyboardEvent) => void;
}

export const TableControls: React.FC<TableControlsProps> = ({
    table,
    filterText,
    setFilterText,
    isColumnMenuOpen,
    setIsColumnMenuOpen,
    handleColumnMenuKeyDown,
}) => {
    return (
        <div className="flex items-center gap-2">
            {/* Filter */}
            <input
                type="text"
                placeholder="Filter by ticker, name, account…"
                className="flex-1 min-w-0 px-3 py-2 rounded-lg text-sm glass outline-none transition-all"
                style={{
                    color: 'var(--text-primary)',
                    caretColor: 'var(--accent)',
                }}
                value={filterText}
                onChange={e => setFilterText(e.target.value)}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-glow)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            />

            {/* Column visibility */}
            <div className="relative flex-shrink-0">
                <button
                    id={ELEMENT_IDS.COLUMN_BUTTON}
                    onClick={() => setIsColumnMenuOpen(!isColumnMenuOpen)}
                    onKeyDown={handleColumnMenuKeyDown}
                    className="px-3 py-2 rounded-lg text-sm glass glass-hover transition-all whitespace-nowrap"
                    style={{ color: 'var(--text-secondary)' }}
                    aria-expanded={isColumnMenuOpen}
                    aria-controls={ELEMENT_IDS.COLUMN_MENU}
                >
                    Columns
                </button>

                {isColumnMenuOpen && (
                    <div
                        id={ELEMENT_IDS.COLUMN_MENU}
                        className="absolute right-0 mt-2 w-48 surface-popover rounded-xl z-20 overflow-hidden shadow-lg"
                        role="menu"
                        aria-labelledby={ELEMENT_IDS.COLUMN_BUTTON}
                    >
                        <div className="py-1">
                            <button
                                className="w-full px-4 py-2 text-left text-xs glass-hover transition-colors"
                                style={{ color: 'var(--text-secondary)' }}
                                onClick={() => table.toggleAllColumnsVisible(true)}
                            >
                                Show all
                            </button>
                            <button
                                className="w-full px-4 py-2 text-left text-xs glass-hover transition-colors"
                                style={{ color: 'var(--text-secondary)' }}
                                onClick={() => table.toggleAllColumnsVisible(false)}
                            >
                                Hide all
                            </button>
                            <div className="h-px my-1" style={{ background: 'var(--border)' }} />
                            {table.getAllColumns().filter(column => column.id !== 'delete').map(column => (
                                <label
                                    key={column.id}
                                    className="flex items-center px-4 py-2 text-xs cursor-pointer glass-hover transition-colors"
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={column.getIsVisible()}
                                        onChange={column.getToggleVisibilityHandler()}
                                        className="mr-2"
                                        style={{ accentColor: 'var(--accent)' }}
                                    />
                                    {String(column.columnDef.header)}
                                </label>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
