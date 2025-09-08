/**
 * Column definitions for the positions table
 * Contains all table column configurations with cell renderers and formatting
 */

import React from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { Position } from '../../types/portfolio';
import { calculateAnnualizedReturn } from '../../utils/returnCalculations';
import { formatBrokerDisplay } from '../../utils/brokerInformationMapping';
import { BASE_CURRENCY_CONSTANT } from '../../utils/yahooFinanceApi';
import { formatCurrencyValue, getHiddenValue } from './currencyUtils';

const columnHelper = createColumnHelper<Position>();

/**
 * Creates the table column definitions with proper formatting and cell renderers
 * Each column includes header, size, and custom cell rendering logic
 * @returns Array of column definitions for react-table
 */
export function createTableColumns() {
    return [
        /**
         * Transaction date column - shows when the position was acquired
         */
        columnHelper.accessor('transactionDate', {
            header: 'Date',
            size: 100,
        }),

        /**
         * Ticker symbol column with link to Yahoo Finance
         * Clickable link that opens in new tab for detailed stock information
         */
        columnHelper.accessor('ticker', {
            header: 'Ticker',
            size: 100,
            cell: (props) => {
                const ticker = props.getValue();
                return (
                    <a 
                        href={`https://finance.yahoo.com/quote/${ticker}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800"
                    >
                        {ticker}
                    </a>
                );
            },
        }),

        /**
         * Company full name column
         */
        columnHelper.accessor('fullName', {
            header: 'Name',
            size: 150,
        }),

        /**
         * Broker column with formatted display names
         * Uses broker information mapping for user-friendly display
         */
        columnHelper.accessor('broker', {
            header: 'Broker',
            size: 140,
            cell: props => {
                const brokerName = props.row.original.broker;
                return formatBrokerDisplay(brokerName);
            },
        }),

        /**
         * Account type column (e.g., JP General, JP NISA)
         */
        columnHelper.accessor('account', {
            header: 'Account',
            size: 100,
        }),

        /**
         * Quantity column with privacy-aware display
         * Shows number of shares/units or hidden dots based on showValues setting
         */
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

        /**
         * Original cost per unit in JPY
         * Calculates and displays the unit price at time of purchase
         */
        columnHelper.accessor('costPerUnit', {
            header: 'Orig Unit Price (JPY)',
            size: 120,
            cell: props => {
                const row = props.row.original;
                const costPerUnitJPY = row.costInJPY / row.quantity;
                return formatCurrencyValue(costPerUnitJPY, 'JPY', props.table.options.meta?.showValues ?? false);
            },
        }),

        /**
         * Total original position value in JPY
         * Shows the total amount invested in this position
         */
        columnHelper.accessor(row => row.costPerUnit * row.quantity, {
            id: 'totalCost',
            header: 'Orig Position (JPY)',
            size: 120,
            cell: props => {
                const row = props.row.original;
                const value = row.costInJPY;
                return formatCurrencyValue(value, 'JPY', props.table.options.meta?.showValues ?? false);
            },
        }),

        /**
         * Original FX rate at time of transaction
         * Only shown if transaction currency differs from stock currency
         */
        columnHelper.accessor('transactionFxRate', {
            header: 'Orig FX Rate',
            size: 120,
            cell: props => {
                const value = props.getValue();
                const row = props.row.original;
                
                if (row.transactionCcy === row.stockCcy) {
                    return <span className="text-gray-400">N/A</span>;
                }
                
                return props.table.options.meta?.showValues
                    ? <span>{value.toFixed(2)}</span>
                    : getHiddenValue(value);
            },
        }),

        /**
         * Current price in stock's native currency
         * Color-coded to show gains (green) or losses (red)
         */
        columnHelper.accessor('currentPrice', {
            header: 'Curr Price (Stock Ccy)',
            size: 120,
            cell: props => {
                const value = props.getValue();
                const row = props.row.original;
                
                if (value === null) {
                    return <span className="text-gray-400">Loading...</span>;
                }
                
                const currencyCode = row.stockCcy;
                const displayValue = formatCurrencyValue(value, currencyCode, props.table.options.meta?.showValues ?? false);
                    
                return (
                    <span className={value >= row.costPerUnit ? 'text-green-600' : 'text-red-600'}>
                        {displayValue}
                    </span>
                );
            },
        }),

        /**
         * Current FX rate from stock currency to JPY
         * Only shown for non-JPY stocks
         */
        columnHelper.accessor('currentFxRate', {
            header: 'Curr FX Rate (Stock-JPY)',
            size: 120,
            cell: props => {
                const value = props.getValue();
                const row = props.row.original;
                
                if (row.stockCcy === BASE_CURRENCY_CONSTANT) {
                    return <span className="text-gray-400">N/A</span>;
                }
                
                if (!props.table.options.meta?.showValues) {
                    return getHiddenValue(value);
                }
                    
                return <span>{value.toFixed(2)}</span>;
            },
        }),

        /**
         * Current position value in JPY
         * Shows the current market value of the position
         */
        columnHelper.accessor('currentValueJPY', {
            header: 'Curr Value (JPY)',
            size: 130,
            cell: props => {
                if (props.row.original.currentPrice === null) {
                    return <span className="text-gray-400">Loading...</span>;
                }
                const value = props.getValue();
                return formatCurrencyValue(value, 'JPY', props.table.options.meta?.showValues ?? false);
            },
        }),

        /**
         * Profit and Loss in JPY
         * Color-coded green for profits, red for losses
         */
        columnHelper.accessor('pnlJPY', {
            header: 'P&L (JPY)',
            size: 130,
            cell: props => {
                const value = props.getValue();
                if (props.row.original.currentPrice === null) {
                    return <span className="text-gray-400">Loading...</span>;
                }
                const displayValue = formatCurrencyValue(value, 'JPY', props.table.options.meta?.showValues ?? false);
                return (
                    <span className={value >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {displayValue}
                    </span>
                );
            },
        }),

        /**
         * Profit and Loss percentage
         * Shows the percentage gain or loss on the position
         */
        columnHelper.accessor('pnlPercentage', {
            header: 'P&L %',
            size: 100,
            cell: props => {
                const value = props.getValue();
                if (props.row.original.currentPrice === null) {
                    return <span className="text-gray-400">Loading...</span>;
                }
                
                if (!props.table.options.meta?.showValues) {
                    return getHiddenValue(value);
                }
                
                return (
                    <span className={value >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                    </span>
                );
            },
        }),

        /**
         * Annualized return percentage
         * Shows the yearly return rate, only calculated for positions held over 1 year
         * Includes tooltip with holding period information
         */
        columnHelper.accessor(row => {
            const days = Math.floor((new Date().getTime() - new Date(row.transactionDate).getTime()) / (1000 * 60 * 60 * 24));
            const annualReturn = calculateAnnualizedReturn(row.pnlPercentage, row.transactionDate);
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
}
