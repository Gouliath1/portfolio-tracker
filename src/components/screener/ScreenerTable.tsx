'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    useReactTable,
    getCoreRowModel,
    getSortedRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    createColumnHelper,
    flexRender,
    type SortingState,
    type Row,
} from '@tanstack/react-table';
import {
    MdSearch, MdClose, MdChevronLeft, MdChevronRight, MdRefresh,
    MdStar, MdStarBorder, MdNotificationsActive, MdNotificationsNone,
    MdShowChart, MdInfoOutline,
} from 'react-icons/md';
import type { IndexConstituent, StockFundamentals, PriceAlert } from '../../types/screener';
import { useScreenerFundamentals, type FundEntry } from '../../hooks/useScreenerFundamentals';

const columnHelper = createColumnHelper<IndexConstituent>();

const PAGE_SIZE = 50;
// Tiered column hiding so Name always has room to breathe.
// lg (1024px): hide sector + marketCap
// xl (1280px): also hide forwardPE
// Only show all columns on very wide screens.
const HIDE_BELOW_LG  = new Set(['sector', 'marketCap']);
const HIDE_BELOW_XL  = new Set(['forwardPE']);

const muted = (text: string) => <span style={{ color: 'var(--text-muted)' }}>{text}</span>;

const fmtNum = (v: number, digits = 2) =>
    v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
const fmtCompact = (v: number) =>
    new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(v);

/** True when the latest price has crossed the alert's target. */
function isAlertTriggered(alert: PriceAlert, price: number | null): boolean {
    if (price == null) return false;
    return alert.direction === 'above' ? price >= alert.target : price <= alert.target;
}

interface ScreenerTableProps {
    constituents: IndexConstituent[];
    onRemove?: (symbol: string) => void;
    removableSymbols?: Set<string>;
    pinnedSymbols: Set<string>;
    onTogglePin: (symbol: string) => void;
    alerts: Record<string, PriceAlert>;
    onEditAlert: (c: IndexConstituent) => void;
    onOpenChart: (c: IndexConstituent, currency: string | null) => void;
}

/**
 * Screener table: sortable/filterable list of an index's names with
 * on-demand fundamentals (PE, div yield, P/B, …). Clicking a row opens its
 * chart; per-row star pins to the watchlist, bell sets a price alert, the
 * refresh icon force-fetches that row, and the leftmost × removes an added
 * ticker. Built on the same @tanstack/react-table stack as PositionsTable.
 */
export function ScreenerTable({
    constituents, onRemove, removableSymbols,
    pinnedSymbols, onTogglePin, alerts, onEditAlert, onOpenChart,
}: ScreenerTableProps) {
    const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }]);
    const [filter, setFilter] = useState('');
    const [infoOpen, setInfoOpen] = useState(false);

    // Read by cells at render time; kept in refs so columns stay stable.
    const mapRef = useRef<Map<string, FundEntry>>(new Map());
    const pinnedRef = useRef(pinnedSymbols); pinnedRef.current = pinnedSymbols;
    const alertsRef = useRef(alerts); alertsRef.current = alerts;
    const refreshRef = useRef<(symbol: string) => void>(() => {});

    // Buttons inside a row must not also trigger the row's open-chart click.
    const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };

    const columns = useMemo(() => {
        // Sort helper for numeric fundamental fields — nulls always sort to bottom.
        const numSort = (field: keyof StockFundamentals) =>
            (rowA: Row<IndexConstituent>, rowB: Row<IndexConstituent>): number => {
                const ea = mapRef.current.get(rowA.original.symbol);
                const eb = mapRef.current.get(rowB.original.symbol);
                const a = ea?.status === 'done' ? (ea.data[field] as number | null) : null;
                const b = eb?.status === 'done' ? (eb.data[field] as number | null) : null;
                if (a == null && b == null) return 0;
                if (a == null) return 1;  // nulls last in ascending
                if (b == null) return -1;
                return (a as number) - (b as number);
            };

        const fundCell = (
            symbol: string,
            render: (d: StockFundamentals) => React.ReactNode | null,
            isRatio = false,
        ): React.ReactNode => {
            const e = mapRef.current.get(symbol);
            if (!e) return muted('·'); // not loaded yet — use refresh / Load page
            if (e.status === 'loading') return muted('…');
            if (e.status === 'error') return <span style={{ color: 'var(--text-muted)' }} title={e.reason}>—</span>;
            const v = render(e.data);
            if (v != null && v !== '') return v;
            // Ratios still pending (price loaded via chart, crumb not yet) → show a
            // retrying dot rather than "—", which would imply "no value".
            if (isRatio && e.ratiosPending) {
                const tip = e.ratiosError
                    ? `Ratios unavailable: ${e.ratiosError}`
                    : "Ratios not loaded yet — click the row's ⟳ to fetch";
                return <span style={{ color: 'var(--text-muted)' }} title={tip}>…</span>;
            }
            return muted('—');
        };
        const priceOf = (symbol: string): number | null => {
            const e = mapRef.current.get(symbol);
            return e?.status === 'done' ? e.data.price : null;
        };

        return [
            // ── Left actions: remove (added only) + pin ──
            columnHelper.display({
                id: 'remove',
                size: 32, minSize: 32, maxSize: 32, enableResizing: false,
                header: () => null,
                cell: props => {
                    if (!removableSymbols?.has(props.row.original.symbol)) return null;
                    return (
                        <button onClick={stop(() => onRemove?.(props.row.original.symbol))}
                            className="flex items-center justify-center p-1 rounded transition-all hover:opacity-70"
                            style={{ color: 'var(--text-muted)' }} aria-label={`Remove ${props.row.original.symbol}`} title="Remove from list">
                            <MdClose size={15} />
                        </button>
                    );
                },
            }),
            columnHelper.display({
                id: 'pin',
                size: 32, minSize: 32, maxSize: 32, enableResizing: false,
                header: () => null,
                cell: props => {
                    const sym = props.row.original.symbol;
                    const pinned = pinnedRef.current.has(sym);
                    return (
                        <button onClick={stop(() => onTogglePin(sym))}
                            className="flex items-center justify-center p-1 rounded transition-all hover:opacity-70"
                            style={{ color: pinned ? 'var(--accent)' : 'var(--text-muted)' }}
                            aria-label={pinned ? `Unpin ${sym}` : `Pin ${sym}`}
                            title={pinned ? 'Pinned to watchlist — click to unpin' : 'Pin to watchlist'}>
                            {pinned ? <MdStar size={17} /> : <MdStarBorder size={17} />}
                        </button>
                    );
                },
            }),
            columnHelper.accessor('code', {
                header: 'Ticker',
                size: 70, minSize: 56,
                cell: props => (
                    <a
                        href={`https://finance.yahoo.com/quote/${props.row.original.symbol}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="font-semibold tabular-nums hover:underline"
                        style={{ color: 'var(--accent)' }}
                    >
                        {props.getValue()}
                    </a>
                ),
            }),
            columnHelper.accessor('name', {
                header: 'Name', size: 220, minSize: 120,
                // Prefer the fetched Yahoo name (proper casing, full name).
                // The static index names (from BlackRock CSV) are ALL CAPS, so
                // convert them to title case as a fallback until the row loads.
                cell: props => {
                    const e = mapRef.current.get(props.row.original.symbol);
                    const fetched = e?.status === 'done' ? e.data.name : null;
                    const staticName = props.getValue() ?? '';
                    const displayStatic = staticName === staticName.toUpperCase() && staticName.length > 0
                        ? staticName.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
                        : staticName;
                    return fetched ?? displayStatic;
                },
            }),
            columnHelper.accessor('sector', {
                header: 'Sector', size: 170, minSize: 80,
                cell: props => props.getValue() ?? muted('—'),
            }),
            columnHelper.display({
                id: 'price', header: 'Price', size: 120, minSize: 80,
                enableSorting: true, sortingFn: numSort('price'),
                cell: props => fundCell(props.row.original.symbol, d =>
                    d.price == null ? null : <span className="tabular-nums">{fmtNum(d.price)} <span style={{ color: 'var(--text-muted)' }}>{d.currency ?? ''}</span></span>),
            }),
            columnHelper.display({
                id: 'trailingPE', header: 'P/E', size: 62, minSize: 50,
                enableSorting: true, sortingFn: numSort('trailingPE'),
                cell: props => fundCell(props.row.original.symbol, d => d.trailingPE == null ? null : <span className="tabular-nums">{fmtNum(d.trailingPE, 1)}</span>, true),
            }),
            columnHelper.display({
                id: 'forwardPE', header: 'Fwd P/E', size: 72, minSize: 56,
                enableSorting: true, sortingFn: numSort('forwardPE'),
                cell: props => fundCell(props.row.original.symbol, d => d.forwardPE == null ? null : <span className="tabular-nums">{fmtNum(d.forwardPE, 1)}</span>, true),
            }),
            columnHelper.display({
                id: 'dividendYield', header: 'Div %', size: 68, minSize: 52,
                enableSorting: true, sortingFn: numSort('dividendYield'),
                cell: props => fundCell(props.row.original.symbol, d => d.dividendYield == null ? null : <span className="tabular-nums">{fmtNum(d.dividendYield * 100, 2)}%</span>, true),
            }),
            columnHelper.display({
                id: 'priceToBook', header: 'P/B', size: 60, minSize: 48,
                enableSorting: true, sortingFn: numSort('priceToBook'),
                cell: props => fundCell(props.row.original.symbol, d => d.priceToBook == null ? null : <span className="tabular-nums">{fmtNum(d.priceToBook, 2)}</span>, true),
            }),
            columnHelper.display({
                id: 'marketCap', header: 'Mkt Cap', size: 80, minSize: 60,
                enableSorting: true, sortingFn: numSort('marketCap'),
                cell: props => fundCell(props.row.original.symbol, d => d.marketCap == null ? null : <span className="tabular-nums">{fmtCompact(d.marketCap)}</span>, true),
            }),
            // ── Right actions: alert + refresh ──
            columnHelper.display({
                id: 'alert', header: 'Alert', size: 74, minSize: 60, enableResizing: false,
                cell: props => {
                    const c = props.row.original;
                    const alert = alertsRef.current[c.symbol];
                    if (!alert) {
                        return (
                            <button onClick={stop(() => onEditAlert(c))}
                                className="flex items-center p-1 rounded transition-all hover:opacity-70"
                                style={{ color: 'var(--text-muted)' }} aria-label={`Set alert for ${c.symbol}`} title="Set a price alert">
                                <MdNotificationsNone size={16} />
                            </button>
                        );
                    }
                    const triggered = isAlertTriggered(alert, priceOf(c.symbol));
                    return (
                        <button onClick={stop(() => onEditAlert(c))}
                            className="flex items-center gap-1 px-1.5 py-1 rounded transition-all hover:opacity-80"
                            style={triggered ? { background: 'var(--accent-dim)', color: 'var(--accent)' } : { color: 'var(--text-secondary)' }}
                            title={`Price alert ${alert.direction} ${alert.target}${triggered ? ' · triggered' : ''}`}>
                            <MdNotificationsActive size={15} />
                            <span className="tabular-nums text-xs">{alert.direction === 'above' ? '≥' : '≤'}{fmtNum(alert.target, 0)}</span>
                        </button>
                    );
                },
            }),
            columnHelper.display({
                id: 'actions', size: 64, minSize: 64, maxSize: 64, enableResizing: false, header: () => null,
                cell: props => {
                    const c = props.row.original;
                    const e = mapRef.current.get(c.symbol);
                    const loading = e?.status === 'loading';
                    const currency = e?.status === 'done' ? e.data.currency : null;
                    return (
                        <div className="flex items-center gap-0.5">
                            <button onClick={stop(() => { onOpenChart(c, currency); })}
                                className="flex items-center justify-center p-1.5 rounded transition-all hover:opacity-70"
                                style={{ color: 'var(--text-secondary)' }} aria-label={`Chart ${c.symbol}`} title="View price chart">
                                <MdShowChart size={16} />
                            </button>
                            <button onClick={stop(() => refreshRef.current(c.symbol))}
                                className="flex items-center justify-center p-1.5 rounded transition-all hover:opacity-70"
                                style={{ color: 'var(--text-secondary)' }} aria-label={`Refresh ${c.symbol}`} title="Refresh this row's data">
                                <MdRefresh size={16} className={loading ? 'animate-spin' : ''} />
                            </button>
                        </div>
                    );
                },
            }),
        ];
    }, [onRemove, removableSymbols, onTogglePin, onEditAlert]);

    const table = useReactTable({
        data: constituents,
        columns,
        state: { sorting, globalFilter: filter },
        initialState: { pagination: { pageSize: PAGE_SIZE, pageIndex: 0 } },
        onSortingChange: setSorting,
        onGlobalFilterChange: setFilter,
        globalFilterFn: (row, _columnId, value) => {
            const q = String(value).toLowerCase();
            const c = row.original;
            return c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || (c.sector ?? '').toLowerCase().includes(q);
        },
        columnResizeMode: 'onChange',
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
    });

    const totalCount = table.getFilteredRowModel().rows.length;
    const pageRows = table.getRowModel().rows;

    const pageSymbolsKey = pageRows.map(r => r.original.symbol).join(',');
    const pageSymbols = useMemo(() => (pageSymbolsKey ? pageSymbolsKey.split(',') : []), [pageSymbolsKey]);
    const { map: fundMap, refresh, loadMany, loadCached, progress } = useScreenerFundamentals();
    mapRef.current = fundMap;
    refreshRef.current = refresh;
    const pageLoading = progress !== null;

    // On load / page change, restore already-cached rows from the DB (no Yahoo).
    useEffect(() => { loadCached(pageSymbols); }, [pageSymbols, loadCached]);

    const pageIndex = table.getState().pagination.pageIndex;
    const pageCount = table.getPageCount();

    // Total pixel width of all visible columns for table-layout:fixed.
    const tableWidth = table.getVisibleLeafColumns().reduce((sum, col) => sum + col.getSize(), 0);

    return (
        <div className="glass rounded-2xl p-3 sm:p-6 flex flex-col gap-4 h-full">
            {/* Controls */}
            <div className="flex items-center justify-between gap-3 flex-wrap flex-shrink-0">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <MdSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                    <input
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                        placeholder="Filter by ticker, name, or sector…"
                        className="w-full pl-9 pr-3 py-2 rounded-lg text-sm glass outline-none focus:ring-1"
                        style={{ color: 'var(--text-primary)', caretColor: 'var(--accent)', ['--tw-ring-color' as string]: 'var(--accent)' }}
                    />
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => loadMany(pageSymbols)}
                        disabled={pageLoading || pageSymbols.length === 0}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                        style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-glow)' }}
                        title="Fetch price + fundamentals for all rows on this page"
                    >
                        <MdRefresh size={15} className={pageLoading ? 'animate-spin' : ''} />
                        {progress ? `Loading ${progress.done}/${progress.total}…` : 'Load page'}
                    </button>
                    <button
                        onClick={() => setInfoOpen(v => !v)}
                        className="flex items-center justify-center p-1.5 rounded-lg transition-all"
                        style={{ color: infoOpen ? 'var(--accent)' : 'var(--text-muted)', background: infoOpen ? 'var(--accent-dim)' : undefined }}
                        title="How are these values calculated?"
                        aria-label="Data methodology info"
                    >
                        <MdInfoOutline size={18} />
                    </button>
                    <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                        {totalCount.toLocaleString()} {totalCount === 1 ? 'name' : 'names'}
                    </span>
                </div>
            </div>

            {/* Methodology info panel */}
            {infoOpen && (
                <div className="rounded-xl px-4 py-3 text-xs flex flex-col gap-3 flex-shrink-0"
                    style={{ background: 'var(--glass-bg)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex flex-col gap-3 min-w-0">

                            {/* How columns are calculated */}
                            <div>
                                <p className="font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>Where do the numbers come from?</p>
                                <p className="mb-2">
                                    <strong>Price</strong> is live from Yahoo Finance. Everything else is <em>calculated</em> using
                                    the latest official earnings data from <strong>J-Quants</strong> (Japan Exchange Group):
                                </p>
                                <div className="flex flex-col gap-1" style={{ color: 'var(--text-primary)' }}>
                                    <span><span className="font-medium">P/E</span> <span style={{ color: 'var(--text-muted)' }}>—</span> price divided by the last 12 months of earnings per share</span>
                                    <span><span className="font-medium">Fwd P/E</span> <span style={{ color: 'var(--text-muted)' }}>—</span> price divided by the company's own earnings forecast for next year</span>
                                    <span><span className="font-medium">P/B</span> <span style={{ color: 'var(--text-muted)' }}>—</span> price divided by book value per share (last annual report)</span>
                                    <span><span className="font-medium">Div %</span> <span style={{ color: 'var(--text-muted)' }}>—</span> annual dividend divided by current price</span>
                                    <span><span className="font-medium">Mkt Cap</span> <span style={{ color: 'var(--text-muted)' }}>—</span> shares outstanding × current price</span>
                                </div>
                            </div>

                            {/* Freshness */}
                            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                                <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>How fresh is the data?</p>
                                <p>
                                    Financial statements update quarterly, so P/E and P/B may be up to one quarter behind real-time sources.
                                    Prices are always current. Click a ticker to open Yahoo Finance for live values.
                                </p>
                            </div>

                            {/* How refresh works */}
                            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                                <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>How does refresh work?</p>
                                <div className="flex flex-col gap-1">
                                    <span><span className="font-medium">On page open</span> <span style={{ color: 'var(--text-muted)' }}>—</span> prices appear instantly; ratios fill in automatically within a few seconds</span>
                                    <span><span className="font-medium">Load page</span> <span style={{ color: 'var(--text-muted)' }}>—</span> forces a fresh fetch for all visible rows at once</span>
                                    <span><span className="font-medium">⟳ per row</span> <span style={{ color: 'var(--text-muted)' }}>—</span> refreshes a single stock immediately</span>
                                    <span><span className="font-medium">Cache</span> <span style={{ color: 'var(--text-muted)' }}>—</span> data is stored for 24 h; re-opening the page restores it without new API calls</span>
                                </div>
                            </div>

                        </div>
                        <button onClick={() => setInfoOpen(false)} style={{ color: 'var(--text-muted)', flexShrink: 0 }} aria-label="Close">
                            <MdClose size={15} />
                        </button>
                    </div>
                </div>
            )}

            {/* Table — table-layout:fixed so column widths never shift on sort or content
                change. Each column has an explicit size; drag the resize handle to adjust. */}
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto rounded-xl">
                <table className="data-table" style={{ tableLayout: 'fixed', width: tableWidth }}>
                    <thead className="sticky top-0 z-10" style={{ background: 'var(--table-header-bg)', backdropFilter: 'blur(12px)' }}>
                        {table.getHeaderGroups().map(headerGroup => (
                            <tr key={headerGroup.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                {headerGroup.headers.map(header => {
                                    const canSort = header.column.getCanSort();
                                    const canResize = header.column.getCanResize();
                                    const hide = HIDE_BELOW_LG.has(header.column.id) ? 'hidden lg:table-cell'
                                        : HIDE_BELOW_XL.has(header.column.id) ? 'hidden xl:table-cell' : '';
                                    return (
                                        <th
                                            key={header.id}
                                            className={`px-2 sm:px-3 py-2 sm:py-3 text-left text-xs font-semibold uppercase tracking-widest select-none relative ${canSort ? 'cursor-pointer' : ''} ${hide}`}
                                            style={{ color: 'var(--text-muted)', width: header.getSize(), overflow: 'hidden' }}
                                            onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                                        >
                                            <span className="inline-flex items-center gap-1 overflow-hidden">
                                                <span className="truncate">{flexRender(header.column.columnDef.header, header.getContext())}</span>
                                                {canSort && (
                                                    <span style={{ color: 'var(--accent)', display: 'inline-block', width: '10px', textAlign: 'center', flexShrink: 0 }}>
                                                        {{ asc: '↑', desc: '↓' }[header.column.getIsSorted() as string] ?? ''}
                                                    </span>
                                                )}
                                            </span>
                                            {/* Resize handle */}
                                            {canResize && (
                                                <div
                                                    onMouseDown={header.getResizeHandler()}
                                                    onTouchStart={header.getResizeHandler()}
                                                    onClick={e => e.stopPropagation()}
                                                    className="absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none"
                                                    style={{
                                                        background: header.column.getIsResizing()
                                                            ? 'var(--accent)'
                                                            : 'var(--border)',
                                                        opacity: header.column.getIsResizing() ? 1 : 0.4,
                                                    }}
                                                    title="Drag to resize column"
                                                />
                                            )}
                                        </th>
                                    );
                                })}
                            </tr>
                        ))}
                    </thead>
                    <tbody>
                        {pageRows.map(row => (
                            <tr
                                key={row.id}
                                className="group transition-colors hover:bg-[var(--glass-bg)]"
                                style={{ borderBottom: '1px solid var(--border)' }}
                            >
                                {row.getVisibleCells().map(cell => {
                                    const hide = HIDE_BELOW_LG.has(cell.column.id) ? 'hidden lg:table-cell'
                                        : HIDE_BELOW_XL.has(cell.column.id) ? 'hidden xl:table-cell' : '';
                                    const isName = cell.column.id === 'name';
                                    return (
                                        <td
                                            key={cell.id}
                                            className={`px-2 sm:px-3 py-2 sm:py-2.5 text-xs sm:text-sm ${isName ? 'truncate' : ''} ${hide}`}
                                            style={{ color: 'var(--text-primary)', width: cell.column.getSize(), overflow: 'hidden' }}
                                        >
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>

                {totalCount === 0 && (
                    <div className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>
                        No names match your filter
                    </div>
                )}
            </div>

            {/* Pagination */}
            {pageCount > 1 && (
                <div className="flex items-center justify-between gap-3 flex-shrink-0 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <span>Page {pageIndex + 1} of {pageCount}</span>
                    <div className="flex items-center gap-2">
                        <button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-40"
                            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                            <MdChevronLeft size={16} /> Prev
                        </button>
                        <button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-40"
                            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                            Next <MdChevronRight size={16} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
