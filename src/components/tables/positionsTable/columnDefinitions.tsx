/**
 * Column definitions for the positions table
 * Contains all table column configurations with cell renderers and formatting
 */

import React from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { Position } from '@portfolio/types';
import { calculateAnnualizedReturn, formatBrokerDisplay, estimateCapitalGainsTax, taxLotKey, DEFAULT_ACCOUNT_TAX_SETTING } from '@portfolio/core';
import { formatCurrencyValue, getHiddenValue } from './currencyUtils';
import { FxRateIcon } from '../../iconsManagement/FxRateIcon';
import { WipBadge } from '../../shared/WipBadge';
import { MdDeleteOutline } from 'react-icons/md';
import { translate, DEFAULT_LANGUAGE, localeTag } from '../../../i18n';
import type { TranslationKey, TranslationParams } from '../../../i18n';

const columnHelper = createColumnHelper<Position>();

/** Translator signature, so callers can hand in the one from `useTranslation`. */
type Translator = (key: TranslationKey, params?: TranslationParams) => string;

interface CreateTableColumnsOptions {
    showDelete?: boolean;
    showSell?: boolean;
    /** Tax estimates are still under development — column omitted entirely unless this is on. */
    showTaxColumn?: boolean;
    /** Defaults to English so non-React callers (and tests) work unchanged. */
    t?: Translator;
    /** BCP 47 tag for number formatting inside cells. */
    locale?: string;
}

/**
 * Creates the table column definitions with proper formatting and cell renderers
 * Each column includes header, size, and custom cell rendering logic
 *
 * Column headers are resolved eagerly with the translator passed in, so they
 * stay plain strings — the column-visibility menu stringifies them.
 * @returns Array of column definitions for react-table
 */
export function createTableColumns({
    showDelete = false,
    showSell = false,
    showTaxColumn = false,
    t = (key, params) => translate(DEFAULT_LANGUAGE, key, params),
    locale = localeTag(DEFAULT_LANGUAGE),
}: CreateTableColumnsOptions = {}) {
    const cols = [
        /**
         * Transaction date column - shows when the position was acquired
         */
        columnHelper.accessor('transactionDate', {
            header: t('column.date'),
            size: 100,
        }),

        /**
         * Ticker symbol column with link to Yahoo Finance
         * Clickable link that opens in new tab for detailed stock information
         */
        columnHelper.accessor('ticker', {
            header: t('column.ticker'),
            size: 100,
            cell: (props) => {
                const ticker = props.getValue();
                return (
                    <a
                        href={`https://finance.yahoo.com/quote/${ticker}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold hover:opacity-70 transition-opacity"
                        style={{ color: 'var(--text-primary)' }}
                    >
                        {ticker}
                    </a>
                );
            },
            footer: props => {
                const count = props.table.getRowModel().rows.length;
                return (
                    <span style={{ color: 'var(--text-muted)' }}>
                        {t('table.totalCount', { count })}
                    </span>
                );
            },
        }),

        /**
         * Company full name column
         */
        columnHelper.accessor('fullName', {
            header: t('column.name'),
            size: 150,
        }),

        /**
         * Broker column with formatted display names
         * Uses broker information mapping for user-friendly display
         */
        columnHelper.accessor('broker', {
            header: t('column.broker'),
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
            header: t('column.account'),
            size: 100,
        }),

        /**
         * Quantity column with privacy-aware display
         * Shows number of shares/units or hidden dots based on showValues setting
         */
        columnHelper.accessor('quantity', {
            header: t('column.quantity'),
            size: 100,
            cell: props => {
                const value = props.getValue();
                return props.table.options.meta?.showValues
                    ? value.toLocaleString(locale)
                    : getHiddenValue(value);
            },
        }),

        /**
         * Original cost per unit in JPY
         * Calculates and displays the unit price at time of purchase
         */
        columnHelper.accessor('costPerUnit', {
            header: t('column.origUnitPrice'),
            size: 120,
            cell: props => {
                const row = props.row.original;
                const baseCcy = props.table.options.meta?.baseCurrency ?? 'JPY';
                const costPerUnitBase = row.costInJPY / row.quantity;
                return formatCurrencyValue(costPerUnitBase, baseCcy, props.table.options.meta?.showValues ?? false, locale);
            },
        }),

        /**
         * Total original position value in base currency
         */
        columnHelper.accessor(row => row.costPerUnit * row.quantity, {
            id: 'totalCost',
            header: t('column.origPosition'),
            size: 120,
            cell: props => {
                const baseCcy = props.table.options.meta?.baseCurrency ?? 'JPY';
                const value = props.row.original.costInJPY;
                return formatCurrencyValue(value, baseCcy, props.table.options.meta?.showValues ?? false, locale);
            },
            footer: props => {
                const total = props.table.getRowModel().rows.reduce((sum, row) => sum + row.original.costInJPY, 0);
                const baseCcy = props.table.options.meta?.baseCurrency ?? 'JPY';
                return formatCurrencyValue(total, baseCcy, props.table.options.meta?.showValues ?? false, locale);
            },
        }),

        /**
         * Original FX rate at time of transaction
         * Shows the FX rate from transaction currency to JPY for non-JPY positions
         */
        columnHelper.accessor('transactionFxRate', {
            header: t('column.origFxRate'),
            size: 140,
            cell: props => {
                const value = props.getValue();
                const row = props.row.original;
                
                const baseCcy = props.table.options.meta?.baseCurrency ?? 'JPY';

                // Show N/A when transaction currency matches base currency (no FX conversion)
                if (row.transactionCcy === baseCcy) {
                    return <span style={{ color: 'var(--text-muted)' }}>{t('common.notApplicable')}</span>;
                }

                // Create Yahoo Finance historical FX rate URL
                const getYahooFxUrl = (fromCcy: string, toCcy: string, date: string) => {
                    const transactionDate = new Date(date);
                    const unixTimestamp = Math.floor(transactionDate.getTime() / 1000);
                    const nextDay = Math.floor((transactionDate.getTime() + 24 * 60 * 60 * 1000) / 1000);
                    return `https://finance.yahoo.com/quote/${fromCcy}${toCcy}=X/history?period1=${unixTimestamp}&period2=${nextDay}&interval=1d`;
                };

                const fxPair = `${row.transactionCcy}${baseCcy}`;
                const yahooUrl = getYahooFxUrl(row.transactionCcy, baseCcy, row.transactionDate);
                
                if (!props.table.options.meta?.showValues) {
                    return getHiddenValue(value);
                }
                
                return (
                    <div className="flex items-center gap-2">
                        <span>{value.toFixed(2)}</span>
                        <a 
                            href={yahooUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:opacity-80 transition-opacity flex-shrink-0"
                            title={t('column.viewHistoricalFx', { pair: fxPair, date: row.transactionDate })}
                        >
                            <FxRateIcon currencyPair={fxPair} className="w-6 h-6" />
                        </a>
                    </div>
                );
            },
        }),

        /**
         * Current price in stock's native currency
         * Color-coded to show gains (green) or losses (red)
         */
        columnHelper.accessor('currentPrice', {
            header: t('column.currPriceStockCcy'),
            size: 120,
            cell: props => {
                const value = props.getValue();
                const row = props.row.original;
                
                if (value === null) {
                    return <span style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</span>;
                }
                
                const currencyCode = row.stockCcy;
                const displayValue = formatCurrencyValue(value, currencyCode, props.table.options.meta?.showValues ?? false, locale);
                    
                return (
                    <span className="tabular-nums" style={{ color: value >= row.costPerUnit ? 'var(--pnl-green)' : 'var(--pnl-red)' }}>
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
            header: () => (
                <span
                    title={t('column.currFxRateTooltip')}
                    className="inline-flex items-center gap-1 cursor-help"
                >
                    {t('column.currFxRate')}
                    <span style={{ color: 'var(--text-muted)' }}>· {t('column.prevClose')}</span>
                </span>
            ),
            size: 140,
            cell: props => {
                const value = props.getValue();
                const row = props.row.original;
                const baseCcy = props.table.options.meta?.baseCurrency ?? 'JPY';

                if (row.stockCcy === baseCcy) {
                    return <span style={{ color: 'var(--text-muted)' }}>{t('common.notApplicable')}</span>;
                }

                if (!props.table.options.meta?.showValues) {
                    return getHiddenValue(value);
                }

                const fxPair = `${row.stockCcy}${baseCcy}`;
                const yahooUrl = `https://finance.yahoo.com/quote/${fxPair}=X`;
                
                return (
                    <div className="flex items-center gap-2">
                        <span>{value.toFixed(2)}</span>
                        <a 
                            href={yahooUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:opacity-80 transition-opacity flex-shrink-0"
                            title={t('column.viewCurrentFx', { pair: fxPair })}
                        >
                            <FxRateIcon currencyPair={fxPair} className="w-6 h-6" />
                        </a>
                    </div>
                );
            },
        }),

        /**
         * Current position value in JPY
         * Shows the current market value of the position
         */
        columnHelper.accessor('currentValueJPY', {
            header: t('column.currValue'),
            size: 130,
            cell: props => {
                if (props.row.original.currentPrice === null) {
                    return <span style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</span>;
                }
                const baseCcy = props.table.options.meta?.baseCurrency ?? 'JPY';
                return formatCurrencyValue(props.getValue(), baseCcy, props.table.options.meta?.showValues ?? false, locale);
            },
            footer: props => {
                const rows = props.table.getRowModel().rows.filter(r => r.original.currentPrice !== null);
                if (rows.length === 0) return null;
                const total = rows.reduce((sum, row) => sum + row.original.currentValueJPY, 0);
                const baseCcy = props.table.options.meta?.baseCurrency ?? 'JPY';
                return formatCurrencyValue(total, baseCcy, props.table.options.meta?.showValues ?? false, locale);
            },
        }),

        /**
         * Unrealized P&L (price move only, dividends excluded). For the
         * dividend-inclusive view see the Total Return % column. Closed
         * lots roll dividends into realized P&L; see ClosedPositionsTable.
         */
        columnHelper.accessor('pnlJPY', {
            header: t('column.unrealizedPnl'),
            size: 140,
            cell: props => {
                const value = props.getValue();
                if (props.row.original.currentPrice === null) {
                    return <span style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</span>;
                }
                const baseCcy = props.table.options.meta?.baseCurrency ?? 'JPY';
                const displayValue = formatCurrencyValue(value, baseCcy, props.table.options.meta?.showValues ?? false, locale);
                return (
                    <span className="tabular-nums" style={{ color: value >= 0 ? 'var(--pnl-green)' : 'var(--pnl-red)' }}>
                        {displayValue}
                    </span>
                );
            },
            footer: props => {
                const rows = props.table.getRowModel().rows.filter(r => r.original.currentPrice !== null);
                if (rows.length === 0) return null;
                const total = rows.reduce((sum, row) => sum + row.original.pnlJPY, 0);
                const baseCcy = props.table.options.meta?.baseCurrency ?? 'JPY';
                const displayValue = formatCurrencyValue(total, baseCcy, props.table.options.meta?.showValues ?? false, locale);
                return (
                    <span className="tabular-nums" style={{ color: total >= 0 ? 'var(--pnl-green)' : 'var(--pnl-red)' }}>
                        {displayValue}
                    </span>
                );
            },
        }),

        /**
         * Unrealized P&L %, mirroring the column above.
         */
        columnHelper.accessor('pnlPercentage', {
            header: t('column.unrealizedPnlPct'),
            size: 130,
            cell: props => {
                const value = props.getValue();
                if (props.row.original.currentPrice === null) {
                    return <span style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</span>;
                }
                
                if (!props.table.options.meta?.showValues) {
                    return getHiddenValue(value);
                }
                
                return (
                    <span className="tabular-nums" style={{ color: value >= 0 ? 'var(--pnl-green)' : 'var(--pnl-red)' }}>
                        {value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                    </span>
                );
            },
        }),

        /**
         * Total return % including dividends.
         *   open:   (currentValue + dividends − cost) / cost × 100
         *   closed: (proceeds      + dividends − cost) / cost × 100
         */
        columnHelper.accessor('totalReturnPercentage', {
            header: t('column.totalReturnPct'),
            size: 110,
            cell: props => {
                const value = props.getValue();
                if (props.row.original.currentPrice === null && props.row.original.status === 'open') {
                    return <span style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</span>;
                }
                if (!props.table.options.meta?.showValues) {
                    return getHiddenValue(value);
                }
                return (
                    <span className="tabular-nums" style={{ color: value >= 0 ? 'var(--pnl-green)' : 'var(--pnl-red)' }}>
                        {value >= 0 ? '+' : ''}{value.toFixed(2)}%
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
            header: t('column.annualReturnPct'),
            size: 100,
            sortingFn: (rowA, rowB) => {
                const a = (rowA.getValue('annualizedReturn') as { sortValue: number }).sortValue;
                const b = (rowB.getValue('annualizedReturn') as { sortValue: number }).sortValue;
                return a - b;
            },
            cell: props => {
                if (props.row.original.currentPrice === null) {
                    return <span style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</span>;
                }
                
                const value = props.getValue();
                if (value.return === null) {
                    const remainingDays = 365 - value.days;
                    return (
                        <span 
                            style={{ color: 'var(--text-muted)' }} 
                            title={t('column.annualReturnPending', { days: value.days, remaining: remainingDays })}
                        >
                            -
                        </span>
                    );
                }
                
                return (
                    <span
                        className="tabular-nums"
                        style={{ color: value.return >= 0 ? 'var(--pnl-green)' : 'var(--pnl-red)' }}
                        title={t('column.annualReturnBasis', { days: value.days, years: (value.days / 365).toFixed(1) })}
                    >
                        {value.return.toFixed(2)}%
                    </span>
                );
            },
        }),

        /**
         * Cumulative dividend income (in base currency) from ex-dates while
         * the lot was held. Sat at the far right of the table to keep it
         * visually separate from price-only P&L numbers.
         */
        columnHelper.accessor('dividendIncomeJPY', {
            header: t('column.totalDividends'),
            size: 130,
            cell: props => {
                const value = props.getValue();
                const baseCcy = props.table.options.meta?.baseCurrency ?? 'JPY';
                if (!value) {
                    return <span style={{ color: 'var(--text-muted)' }}>—</span>;
                }
                return formatCurrencyValue(value, baseCcy, props.table.options.meta?.showValues ?? false, locale);
            },
            footer: props => {
                const total = props.table.getRowModel().rows.reduce((sum, row) => sum + (row.original.dividendIncomeJPY ?? 0), 0);
                const baseCcy = props.table.options.meta?.baseCurrency ?? 'JPY';
                if (!total) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
                return formatCurrencyValue(total, baseCcy, props.table.options.meta?.showValues ?? false, locale);
            },
        }),

        /**
         * Estimated capital-gains tax if this position were sold today, based
         * on tax residence + the account's wrapper (Settings → Taxes). Always
         * computed — and shown — in JPY, the taxpayer's reporting currency,
         * regardless of the table's display base currency: the gain must use
         * the historical JPY rate at acquisition vs. today's JPY rate, which
         * is a different (and correct) number from converting the display-
         * currency gain at today's rate. Estimate only, not tax advice — see
         * src/lib/core/taxRules.ts for the model and its limitations. Still
         * under development — omitted entirely unless enabled in Settings.
         */
        ...(showTaxColumn ? [columnHelper.accessor(row => row, {
            id: 'estTaxIfSold',
            header: () => (
                <span title={t('column.estTaxIfSoldTooltip')} className="cursor-help inline-flex items-center gap-1.5">
                    {t('column.estTaxIfSold')}
                    <WipBadge />
                </span>
            ),
            size: 140,
            cell: props => {
                const row = props.row.original;
                if (row.currentPrice === null) {
                    return <span style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</span>;
                }
                const meta = props.table.options.meta;
                const setting = meta?.accountTaxSettings?.[row.account] ?? DEFAULT_ACCOUNT_TAX_SETTING;
                if (setting.wrapper === 'NONE' || !meta?.taxResidenceCountry) {
                    return <span style={{ color: 'var(--text-muted)' }} title={t('column.estTaxSetupHint')}>{t('common.notApplicable')}</span>;
                }
                const gainJpy = meta.taxGainJpyByKey?.get(taxLotKey(row));
                if (gainJpy === undefined) {
                    return <span style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</span>;
                }
                const holdingDays = Math.floor((Date.now() - new Date(row.transactionDate).getTime()) / (1000 * 60 * 60 * 24));
                const estimate = estimateCapitalGainsTax({
                    gain: gainJpy,
                    holdingDays,
                    residenceCountry: meta.taxResidenceCountry,
                    setting,
                });
                if (!estimate) {
                    return <span style={{ color: 'var(--text-muted)' }}>{t('common.notApplicable')}</span>;
                }
                const displayValue = formatCurrencyValue(estimate.totalTax, 'JPY', meta.showValues ?? false, locale);
                const tooltip = estimate.sourceTax > 0 ? `${estimate.residenceLabel} · ${estimate.sourceLabel}` : estimate.residenceLabel;
                return (
                    <span className="tabular-nums" title={tooltip} style={{ color: 'var(--text-secondary)' }}>
                        {displayValue}
                    </span>
                );
            },
            footer: props => {
                const meta = props.table.options.meta;
                if (!meta?.taxResidenceCountry || !meta.accountTaxSettings || !meta.taxGainJpyByKey) return null;
                const rows = props.table.getRowModel().rows.filter(r => r.original.currentPrice !== null);
                if (rows.length === 0) return null;
                let total = 0;
                let any = false;
                for (const row of rows) {
                    const setting = meta.accountTaxSettings[row.original.account] ?? DEFAULT_ACCOUNT_TAX_SETTING;
                    if (setting.wrapper === 'NONE') continue;
                    const gainJpy = meta.taxGainJpyByKey.get(taxLotKey(row.original));
                    if (gainJpy === undefined) continue;
                    const holdingDays = Math.floor((Date.now() - new Date(row.original.transactionDate).getTime()) / (1000 * 60 * 60 * 24));
                    const estimate = estimateCapitalGainsTax({
                        gain: gainJpy,
                        holdingDays,
                        residenceCountry: meta.taxResidenceCountry,
                        setting,
                    });
                    if (!estimate) continue;
                    any = true;
                    total += estimate.totalTax;
                }
                if (!any) return null;
                return formatCurrencyValue(total, 'JPY', meta.showValues ?? false, locale);
            },
        })] : []),
    ];

    if (showSell) {
        const sellCol = columnHelper.display({
            id: 'sell',
            size: 60,
            header: () => null,
            cell: props => {
                const onSell = props.table.options.meta?.onSellRow;
                return (
                    <button
                        onClick={e => { e.stopPropagation(); onSell?.(props.row.original); }}
                        className="flex items-center justify-center px-2 py-1 rounded text-xs font-medium transition-all"
                        style={{
                            background: 'var(--accent-dim)',
                            color: 'var(--accent)',
                            border: '1px solid var(--accent-glow)',
                        }}
                        aria-label={t('table.sellPosition')}
                        title={t('table.sellPositionTitle')}
                    >
                        {t('table.sell')}
                    </button>
                );
            },
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cols.unshift(sellCol as any);
    }

    if (showDelete) {
        const deleteCol = columnHelper.display({
            id: 'delete',
            size: 44,
            header: () => null,
            cell: props => {
                const onDelete = props.table.options.meta?.onDeleteRow;
                return (
                    <button
                        onClick={e => { e.stopPropagation(); onDelete?.(props.row.original); }}
                        className="flex items-center justify-center p-2 rounded transition-all hover:opacity-70"
                        style={{ color: 'var(--text-muted, #6b7280)' }}
                        aria-label={t('table.deletePosition')}
                        title={t('table.deletePosition')}
                    >
                        <MdDeleteOutline size={18} />
                    </button>
                );
            },
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cols.unshift(deleteCol as any);
    }

    return cols;
}
