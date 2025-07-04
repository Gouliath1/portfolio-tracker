'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import {
    createColumnHelper,
    flexRender,
    getCoreRowModel,
    getSortedRowModel,
    useReactTable,
    type SortingState,
    type ColumnResizeMode,
    type VisibilityState,
    type ColumnSizingState,
} from '@tanstack/react-table';
import { Position } from '../types/portfolio';
import { calculateAnnualizedReturn } from '../utils/returnCalculations';

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

const columnHelper = createColumnHelper<Position>();

// Default column sizes
const defaultColumnSizing: ColumnSizingState = {
    transactionDate: 100,
    ticker: 100,
    fullName: 150,
    account: 100,
    quantity: 100,
    costPerUnit: 120,
    currentPrice: 120,
    transactionFxRate: 120,
    currentFxRate: 120,
    costInJPY: 130,
    currentValueJPY: 130,
    pnlJPY: 130,
    pnlPercentage: 100,
    annualizedReturn: 100,
};

// Default column visibility (FX rate columns hidden by default)
const defaultColumnVisibility: VisibilityState = {
    transactionFxRate: false,
    currentFxRate: false,
};

const getHiddenValue = (value: number) => '•'.repeat(Math.min(8, Math.ceil(Math.log10(Math.abs(value) + 1))));

const columns = [
    columnHelper.accessor('transactionDate', {
        header: 'Date',
        size: 100,
    }),
    columnHelper.accessor('ticker', {
        header: 'Ticker',
        size: 100,
        cell: props => (
            <a 
                href={`https://finance.yahoo.com/quote/${props.getValue()}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800"
            >
                {props.getValue()}
            </a>
        ),
    }),
    columnHelper.accessor('fullName', {
        header: 'Name',
        size: 150,
    }),
    columnHelper.accessor('account', {
        header: 'Account',
        size: 100,
    }),
    columnHelper.accessor('quantity', {
        header: 'Quantity',
        size: 100,
        cell: props => {
            const value = props.getValue();
            return props.table.options.meta?.showValues
                ? value.toLocaleString()
                : getHiddenValue(value);
        },
    }),
    columnHelper.accessor('costPerUnit', {
        header: 'Cost/Unit',
        size: 120,
        cell: props => {
            const ccy = props.row.original.baseCcy === 'JPY' ? '¥' : '$';
            const value = props.getValue();
            return ccy + (props.table.options.meta?.showValues 
                ? value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : getHiddenValue(value)
            );
        },
    }),
    columnHelper.accessor('currentPrice', {
        header: 'Current Price',
        size: 120,
        cell: props => {
            const value = props.getValue();
            const row = props.row.original;
            if (value === null) return <span className="text-gray-400">Loading...</span>;
            
            const ccy = row.baseCcy === 'JPY' ? '¥' : '$';
            const displayValue = props.table.options.meta?.showValues 
                ? value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : getHiddenValue(value);
                
            return (
                <span className={value >= row.costPerUnit ? 'text-green-600' : 'text-red-600'}>
                    {ccy}{displayValue}
                </span>
            );
        },
    }),
    columnHelper.accessor('transactionFxRate', {
        header: 'FX Rate (Transaction)',
        size: 120,
        cell: props => {
            const value = props.getValue();
            const row = props.row.original;
            
            // Only show FX rate for non-JPY currencies
            if (row.baseCcy === 'JPY') {
                return <span className="text-gray-400">N/A</span>;
            }
            
            return props.table.options.meta?.showValues
                ? value.toFixed(4)
                : getHiddenValue(value);
        },
    }),
    columnHelper.accessor('currentFxRate', {
        header: 'FX Rate (Current)',
        size: 120,
        cell: props => {
            const value = props.getValue();
            const row = props.row.original;
            
            // Only show FX rate for non-JPY currencies
            if (row.baseCcy === 'JPY') {
                return <span className="text-gray-400">N/A</span>;
            }
            
            const displayValue = props.table.options.meta?.showValues
                ? value.toFixed(4)
                : getHiddenValue(value);
                
            // Color code based on comparison with transaction rate
            const isHigher = value > row.transactionFxRate;
            const colorClass = isHigher ? 'text-green-600' : 'text-red-600';
            
            return (
                <span className={colorClass} title={`Transaction: ${row.transactionFxRate.toFixed(4)}`}>
                    {displayValue}
                </span>
            );
        },
    }),
    columnHelper.accessor('costInJPY', {
        header: 'Cost (JPY)',
        size: 130,
        cell: props => {
            const value = props.getValue();
            return props.table.options.meta?.showValues
                ? `¥${value.toLocaleString()}`
                : `¥${getHiddenValue(value)}`;
        },
    }),
    columnHelper.accessor('currentValueJPY', {
        header: 'Value (JPY)',
        size: 130,
        cell: props => {
            if (props.row.original.currentPrice === null) {
                return <span className="text-gray-400">Loading...</span>;
            }
            const value = props.getValue();
            return props.table.options.meta?.showValues
                ? `¥${value.toLocaleString()}`
                : `¥${getHiddenValue(value)}`;
        },
    }),
    columnHelper.accessor('pnlJPY', {
        header: 'P&L (JPY)',
        size: 130,
        cell: props => {
            const value = props.getValue();
            if (props.row.original.currentPrice === null) {
                return <span className="text-gray-400">Loading...</span>;
            }
            return (
                <span className={value >= 0 ? 'text-green-600' : 'text-red-600'}>
                    {props.table.options.meta?.showValues
                        ? `¥${value.toLocaleString()}`
                        : `¥${getHiddenValue(value)}`}
                </span>
            );
        },
    }),
    columnHelper.accessor('pnlPercentage', {
        header: 'P&L %',
        size: 100,
        cell: props => {
            const value = props.getValue();
            if (props.row.original.currentPrice === null) {
                return <span className="text-gray-400">Loading...</span>;
            }
            return (
                <span className={value >= 0 ? 'text-green-600' : 'text-red-600'}>
                    {value.toFixed(2)}%
                </span>
            );
        },
    }),
    columnHelper.accessor(row => {
        const days = Math.floor((new Date().getTime() - new Date(row.transactionDate).getTime()) / (1000 * 60 * 60 * 24));
        const annualReturn = calculateAnnualizedReturn(row.pnlPercentage, row.transactionDate);
        // For sorting: use annualized return if available, otherwise use negative days to sort newer positions last
        const sortValue = annualReturn !== null ? annualReturn : -days;
        
        return {
            return: annualReturn,
            days,
            sortValue
        };
    }, {
        id: 'annualizedReturn',
        header: 'Annual Return %',
        size: 100,
        sortingFn: (rowA, rowB) => {
            const a = (rowA.getValue('annualizedReturn') as { sortValue: number }).sortValue;
            const b = (rowB.getValue('annualizedReturn') as { sortValue: number }).sortValue;
            return a - b;
        },
        cell: props => {
            if (props.row.original.currentPrice === null) {
                return <span className="text-gray-400">Loading...</span>;
            }
            
            const value = props.getValue();
            if (value.return === null) {
                const remainingDays = 365 - value.days;
                return (
                    <span 
                        className="text-gray-400" 
                        title={`Position held for ${value.days} days. Annual return will be calculated after 1 year (${remainingDays} days remaining).`}
                    >
                        -
                    </span>
                );
            }
            
            return (
                <span 
                    className={value.return >= 0 ? 'text-green-600' : 'text-red-600'}
                    title={`Annualized based on ${value.days} days holding period (${(value.days / 365).toFixed(1)} years)`}
                >
                    {value.return.toFixed(2)}%
                </span>
            );
        },
    }),
];

export const PositionsTable = ({ positions, showValues }: PositionsTableProps) => {
    const [sorting, setSorting] = useState<SortingState>([]);
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => {
        const saved = typeof window !== 'undefined' ? localStorage.getItem('columnVisibility') : null;
        return saved ? JSON.parse(saved) : defaultColumnVisibility;
    });
    const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(() => {
        const saved = typeof window !== 'undefined' ? localStorage.getItem('columnSizing') : null;
        return saved ? JSON.parse(saved) : defaultColumnSizing;
    });
    const [filterText, setFilterText] = useState('');
    const [isColumnMenuOpen, setIsColumnMenuOpen] = useState(false);

    // Save column visibility to localStorage
    useEffect(() => {
        localStorage.setItem('columnVisibility', JSON.stringify(columnVisibility));
    }, [columnVisibility]);

    // Save column sizing to localStorage
    useEffect(() => {
        localStorage.setItem('columnSizing', JSON.stringify(columnSizing));
    }, [columnSizing]);

    // Close column menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const columnMenu = document.getElementById('column-menu');
            const columnButton = document.getElementById('column-button');
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

    // Handle keyboard navigation for column menu
    const handleColumnMenuKeyDown = useCallback((event: React.KeyboardEvent) => {
        if (event.key === 'Escape') {
            setIsColumnMenuOpen(false);
        }
    }, []);

    const filteredData = useMemo(() => {
        if (!filterText) return positions;
        const searchText = filterText.toLowerCase();
        return positions.filter(pos => 
            pos.ticker.toString().toLowerCase().includes(searchText) ||
            pos.fullName.toLowerCase().includes(searchText) ||
            pos.account.toLowerCase().includes(searchText)
        );
    }, [positions, filterText]);

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
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="relative">
                    <button
                        id="column-button"
                        onClick={() => setIsColumnMenuOpen(!isColumnMenuOpen)}
                        onKeyDown={handleColumnMenuKeyDown}
                        className="px-4 py-2 text-gray-900 bg-white border rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        aria-expanded={isColumnMenuOpen}
                        aria-controls="column-menu"
                    >
                        Columns
                    </button>
                    {isColumnMenuOpen && (
                        <div
                            id="column-menu"
                            className="absolute mt-2 w-48 bg-white border rounded-lg shadow-lg z-10"
                            role="menu"
                            aria-labelledby="column-button"
                        >
                            <div className="py-1">
                                <button
                                    className="w-full px-4 py-2 text-left text-sm text-gray-900 hover:bg-gray-100 focus:outline-none focus:bg-gray-100"
                                    onClick={() => table.toggleAllColumnsVisible(true)}
                                >
                                    Show All
                                </button>
                                <button
                                    className="w-full px-4 py-2 text-left text-sm text-gray-900 hover:bg-gray-100 focus:outline-none focus:bg-gray-100"
                                    onClick={() => table.toggleAllColumnsVisible(false)}
                                >
                                    Hide All
                                </button>
                                <div className="h-px bg-gray-200 my-1" />
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
                <input
                    type="text"
                    placeholder="Filter by ticker, name, or account..."
                    className="w-full sm:w-auto px-4 py-2 text-gray-900 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                />
            </div>
            <div className="overflow-auto border rounded-lg h-[calc(100vh-280px)] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-track]:bg-gray-100">
                <table className="min-w-full divide-y divide-gray-200 table-fixed" style={{ width: table.getCenterTotalSize() }}>
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
                                        <div className="flex items-center">
                                            <span className="truncate">
                                                {flexRender(header.column.columnDef.header, header.getContext())}
                                            </span>
                                            <span className="ml-1 inline-block min-w-[16px]">
                                                {{
                                                    asc: '↑',
                                                    desc: '↓',
                                                }[header.column.getIsSorted() as string] ?? ''}
                                            </span>
                                        </div>
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
                {table.getRowModel().rows.length === 0 && (
                    <div className="text-center py-4 text-gray-500">
                        No positions match your filter criteria
                    </div>
                )}
            </div>
        </div>
    );
};
