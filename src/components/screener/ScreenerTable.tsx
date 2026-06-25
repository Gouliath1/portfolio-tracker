'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
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
    MdShowChart, MdInfoOutline, MdDownload,
} from 'react-icons/md';
import type { IndexConstituent, StockFundamentals, PriceAlert } from '../../types/screener';
import { useScreenerFundamentals, type FundEntry } from '../../hooks/useScreenerFundamentals';

const columnHelper = createColumnHelper<IndexConstituent>();
const PAGE_SIZE = 50;

const muted = (text: string) => <span style={{ color: 'var(--text-muted)' }}>{text}</span>;

const fmtNum = (v: number, digits = 2) =>
    v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

// JPY prices: strip .00 but keep .5 for half-yen increments.
const fmtPrice = (price: number, currency: string | null) =>
    currency === 'JPY'
        ? price.toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 1 })
        : fmtNum(price, 2);

const fmtCompact = (v: number) =>
    new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(v);

function isAlertTriggered(alert: PriceAlert, price: number | null): boolean {
    if (price == null) return false;
    return alert.direction === 'above' ? price >= alert.target : price <= alert.target;
}

// Responsive breakpoint hook — drives columnVisibility so react-table truly
// excludes hidden columns from the width calculation (CSS-only hiding doesn't).
function useBreakpoints() {
    const [bp, setBp] = useState({ sm: true, lg: true, xl: true });
    useEffect(() => {
        const queries = [
            window.matchMedia('(min-width: 640px)'),
            window.matchMedia('(min-width: 1024px)'),
            window.matchMedia('(min-width: 1280px)'),
        ];
        const update = () => setBp({ sm: queries[0].matches, lg: queries[1].matches, xl: queries[2].matches });
        update();
        queries.forEach(q => q.addEventListener('change', update));
        return () => queries.forEach(q => q.removeEventListener('change', update));
    }, []);
    return bp;
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

export function ScreenerTable({
    constituents, onRemove, removableSymbols,
    pinnedSymbols, onTogglePin, alerts, onEditAlert, onOpenChart,
}: ScreenerTableProps) {
    const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }]);
    const [filter, setFilter] = useState('');
    const [infoOpen, setInfoOpen] = useState(false);
    const bp = useBreakpoints();

    const mapRef = useRef<Map<string, FundEntry>>(new Map());
    const pinnedRef = useRef(pinnedSymbols); pinnedRef.current = pinnedSymbols;
    const alertsRef = useRef(alerts); alertsRef.current = alerts;
    const refreshRef = useRef<(symbol: string) => void>(() => {});
    // Cache Yahoo names so they don't revert to static title-case on re-render.
    const nameCacheRef = useRef<Map<string, string>>(new Map());

    const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };

    const columns = useMemo(() => {
        const numSort = (field: keyof StockFundamentals) =>
            (rowA: Row<IndexConstituent>, rowB: Row<IndexConstituent>): number => {
                const ea = mapRef.current.get(rowA.original.symbol);
                const eb = mapRef.current.get(rowB.original.symbol);
                const a = ea?.status === 'done' ? (ea.data[field] as number | null) : null;
                const b = eb?.status === 'done' ? (eb.data[field] as number | null) : null;
                if (a == null && b == null) return 0;
                if (a == null) return 1;
                if (b == null) return -1;
                return (a as number) - (b as number);
            };

        const fundCell = (
            symbol: string,
            render: (d: StockFundamentals) => React.ReactNode | null,
            isRatio = false,
        ): React.ReactNode => {
            const e = mapRef.current.get(symbol);
            if (!e) return muted('·');
            if (e.status === 'loading') return muted('…');
            if (e.status === 'error') return <span style={{ color: 'var(--text-muted)' }} title={e.reason}>—</span>;
            const v = render(e.data);
            if (v != null && v !== '') return v;
            if (isRatio && e.ratiosPending) {
                const tip = e.ratiosError ? `Ratios unavailable: ${e.ratiosError}` : 'Ratios pending — click ⟳ to fetch';
                return <span style={{ color: 'var(--text-muted)' }} title={tip}>…</span>;
            }
            return muted('—');
        };

        const priceOf = (symbol: string) => {
            const e = mapRef.current.get(symbol);
            return e?.status === 'done' ? e.data.price : null;
        };

        return [
            // Remove (added tickers only)
            columnHelper.display({
                id: 'remove', size: 28, minSize: 28, maxSize: 28, enableResizing: false,
                header: () => null,
                cell: props => {
                    if (!removableSymbols?.has(props.row.original.symbol)) return null;
                    return (
                        <button onClick={stop(() => onRemove?.(props.row.original.symbol))}
                            className="flex items-center justify-center p-1 rounded hover:opacity-70"
                            style={{ color: 'var(--text-muted)' }} title="Remove from list">
                            <MdClose size={14} />
                        </button>
                    );
                },
            }),
            // Pin / star
            columnHelper.display({
                id: 'pin', size: 28, minSize: 28, maxSize: 28, enableResizing: false,
                header: () => null,
                cell: props => {
                    const sym = props.row.original.symbol;
                    const pinned = pinnedRef.current.has(sym);
                    return (
                        <button onClick={stop(() => onTogglePin(sym))}
                            className="flex items-center justify-center p-1 rounded hover:opacity-70"
                            style={{ color: pinned ? 'var(--accent)' : 'var(--text-muted)' }}
                            title={pinned ? 'Pinned — click to unpin' : 'Pin to watchlist'}>
                            {pinned ? <MdStar size={16} /> : <MdStarBorder size={16} />}
                        </button>
                    );
                },
            }),
            // Ticker code — Yahoo Finance link
            columnHelper.accessor('code', {
                header: 'Ticker', size: 68, minSize: 52,
                cell: props => (
                    <a href={`https://finance.yahoo.com/quote/${props.row.original.symbol}`}
                        target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="hover:underline"
                        style={{ color: 'var(--accent)' }}>
                        {props.getValue()}
                    </a>
                ),
            }),
            // Name — prefers Yahoo name; falls back to title-cased static name.
            // nameCacheRef prevents the flicker from static → Yahoo on each re-render.
            columnHelper.accessor('name', {
                header: 'Name', size: 160, minSize: 90,
                cell: props => {
                    const sym = props.row.original.symbol;
                    const e = mapRef.current.get(sym);
                    const yahooName = e?.status === 'done' ? e.data.name : null;
                    if (yahooName) nameCacheRef.current.set(sym, yahooName);
                    const cached = nameCacheRef.current.get(sym);
                    const staticName = props.getValue() ?? '';
                    const fallback = staticName === staticName.toUpperCase() && staticName.length > 0
                        ? staticName.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
                        : staticName;
                    return cached ?? fallback;
                },
            }),
            // Sector (hidden on phone + tablet)
            columnHelper.accessor('sector', {
                header: 'Sector', size: 150, minSize: 80,
                cell: props => props.getValue() ?? muted('—'),
            }),
            // Price
            columnHelper.accessor(() => null, {
                id: 'price', header: 'Price', size: 110, minSize: 72,
                enableSorting: true, sortingFn: numSort('price'),
                cell: props => fundCell(props.row.original.symbol, d =>
                    d.price == null ? null : (
                        <span className="tabular-nums">
                            {d.currency === 'JPY' ? '¥' : ''}{fmtPrice(d.price, d.currency)}{' '}
                            {d.currency !== 'JPY' && <span style={{ color: 'var(--text-muted)' }}>{d.currency ?? ''}</span>}
                        </span>
                    )),
            }),
            // P/E (hidden on phone)
            columnHelper.accessor(() => null, {
                id: 'trailingPE', header: 'P/E', size: 58, minSize: 44,
                enableSorting: true, sortingFn: numSort('trailingPE'),
                cell: props => fundCell(props.row.original.symbol, d =>
                    d.trailingPE == null ? null : <span className="tabular-nums">{fmtNum(d.trailingPE, 1)}</span>, true),
            }),
            // Fwd P/E (hidden until xl)
            columnHelper.accessor(() => null, {
                id: 'forwardPE', header: 'Fwd P/E', size: 68, minSize: 52,
                enableSorting: true, sortingFn: numSort('forwardPE'),
                cell: props => fundCell(props.row.original.symbol, d =>
                    d.forwardPE == null ? null : <span className="tabular-nums">{fmtNum(d.forwardPE, 1)}</span>, true),
            }),
            // Div % (hidden on phone)
            columnHelper.accessor(() => null, {
                id: 'dividendYield', header: 'Div %', size: 62, minSize: 48,
                enableSorting: true, sortingFn: numSort('dividendYield'),
                cell: props => fundCell(props.row.original.symbol, d =>
                    d.dividendYield == null ? null : <span className="tabular-nums">{fmtNum(d.dividendYield * 100, 2)}%</span>, true),
            }),
            // P/B (hidden on phone)
            columnHelper.accessor(() => null, {
                id: 'priceToBook', header: 'P/B', size: 56, minSize: 44,
                enableSorting: true, sortingFn: numSort('priceToBook'),
                cell: props => fundCell(props.row.original.symbol, d =>
                    d.priceToBook == null ? null : <span className="tabular-nums">{fmtNum(d.priceToBook, 2)}</span>, true),
            }),
            // Mkt Cap (hidden on phone + tablet)
            columnHelper.accessor(() => null, {
                id: 'marketCap', header: 'Mkt Cap (¥)', size: 82, minSize: 60,
                enableSorting: true, sortingFn: numSort('marketCap'),
                cell: props => fundCell(props.row.original.symbol, d =>
                    d.marketCap == null ? null : <span className="tabular-nums">¥{fmtCompact(d.marketCap)}</span>, true),
            }),
            // ── Single Actions column: alert · chart · refresh ──
            columnHelper.display({
                id: 'actions', header: 'Actions', size: 88, minSize: 80, maxSize: 88, enableResizing: false,
                cell: props => {
                    const c = props.row.original;
                    const e = mapRef.current.get(c.symbol);
                    const loading = e?.status === 'loading';
                    const currency = e?.status === 'done' ? e.data.currency : null;
                    const alert = alertsRef.current[c.symbol];
                    const triggered = alert ? isAlertTriggered(alert, priceOf(c.symbol)) : false;
                    return (
                        <div className="flex items-center gap-0.5 pr-2">
                            <button onClick={stop(() => onEditAlert(c))}
                                className="flex items-center justify-center p-1.5 rounded hover:opacity-70 transition-all"
                                style={{ color: triggered ? 'var(--accent)' : 'var(--text-muted)' }}
                                title={alert ? `Alert ${alert.direction} ${fmtNum(alert.target, 0)}${triggered ? ' · triggered' : ''}` : 'Set price alert'}>
                                {alert ? <MdNotificationsActive size={15} /> : <MdNotificationsNone size={15} />}
                            </button>
                            <button onClick={stop(() => onOpenChart(c, currency))}
                                className="flex items-center justify-center p-1.5 rounded hover:opacity-70 transition-all"
                                style={{ color: 'var(--text-secondary)' }} title="View chart">
                                <MdShowChart size={15} />
                            </button>
                            <button onClick={stop(() => refreshRef.current(c.symbol))}
                                className="flex items-center justify-center p-1.5 rounded hover:opacity-70 transition-all"
                                style={{ color: 'var(--text-secondary)' }} title="Refresh data">
                                <MdRefresh size={15} className={loading ? 'animate-spin' : ''} />
                            </button>
                        </div>
                    );
                },
            }),
        ];
    }, [onRemove, removableSymbols, onTogglePin, onEditAlert]);

    // Column visibility — all data columns always shown; only layout columns
    // (Sector, Mkt Cap, Fwd P/E) hide on narrower screens to reduce clutter.
    // On phone the table scrolls horizontally to show all columns.
    const columnVisibility = useMemo(() => ({
        remove: (removableSymbols?.size ?? 0) > 0,
        sector: bp.lg,
        marketCap: bp.lg,
        forwardPE: bp.xl,
    }), [bp, removableSymbols]);

    const table = useReactTable({
        data: constituents,
        columns,
        state: { sorting, globalFilter: filter, columnVisibility },
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

    useEffect(() => { loadCached(pageSymbols); }, [pageSymbols, loadCached]);

    const exportToExcel = useCallback((scope: 'page' | 'all') => {
        const rows = scope === 'page'
            ? table.getRowModel().rows.map(r => r.original)
            : table.getFilteredRowModel().rows.map(r => r.original);

        const data = rows.map(c => {
            const e = fundMap.get(c.symbol);
            const d = e?.status === 'done' ? e.data : null;
            return {
                Ticker: c.code,
                Name: nameCacheRef.current.get(c.symbol) ?? c.name,
                Sector: c.sector ?? '',
                'Price (JPY)': d?.price ?? '',
                'P/E': d?.trailingPE ?? '',
                'Fwd P/E': d?.forwardPE ?? '',
                'Div %': d?.dividendYield != null ? +(d.dividendYield * 100).toFixed(2) : '',
                'P/B': d?.priceToBook ?? '',
                'Mkt Cap (¥)': d?.marketCap ?? '',
            };
        });

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Screener');
        XLSX.writeFile(wb, `screener-${scope}-${new Date().toISOString().slice(0, 10)}.xlsx`);
    }, [table, fundMap]);

    const pageIndex = table.getState().pagination.pageIndex;
    const pageCount = table.getPageCount();

    // All columns have explicit pixel widths. Table is width:100% so they
    // scale proportionally to fill the container. minWidth prevents the table
    // from shrinking below the sum of minimum column sizes.
    const minTableWidth = table.getVisibleLeafColumns().reduce((sum, c) => sum + (c.columnDef.minSize ?? 40), 0);

    return (
        <div className="glass rounded-2xl p-3 sm:p-4 flex flex-col gap-3 h-full">
            {/* Controls */}
            <div className="flex items-center justify-between gap-2 flex-wrap flex-shrink-0">
                <div className="relative flex-1 min-w-[160px] max-w-sm">
                    <MdSearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                    <input value={filter} onChange={e => setFilter(e.target.value)}
                        placeholder="Filter by ticker, name, or sector…"
                        className="w-full pl-9 pr-3 py-2 rounded-lg text-sm glass outline-none focus:ring-1"
                        style={{ color: 'var(--text-primary)', caretColor: 'var(--accent)', ['--tw-ring-color' as string]: 'var(--accent)' }} />
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => loadMany(pageSymbols)} disabled={pageLoading || pageSymbols.length === 0}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                        style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-glow)' }}>
                        <MdRefresh size={14} className={pageLoading ? 'animate-spin' : ''} />
                        <span className="hidden sm:inline">{progress ? `${progress.done}/${progress.total}…` : 'Load page'}</span>
                        <span className="sm:hidden">{progress ? `${progress.done}/${progress.total}` : 'Load'}</span>
                    </button>
                    {/* Export dropdown */}
                    <div className="relative group/export">
                        <button className="flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-medium transition-all"
                            style={{ color: 'var(--text-secondary)', background: 'var(--glass-bg)', border: '1px solid var(--border)' }}
                            title="Export to Excel">
                            <MdDownload size={14} />
                            <span className="hidden sm:inline">Export</span>
                        </button>
                        <div className="absolute right-0 top-full mt-1 z-20 rounded-lg overflow-hidden shadow-lg opacity-0 pointer-events-none group-hover/export:opacity-100 group-hover/export:pointer-events-auto transition-all"
                            style={{ background: 'var(--surface-popover)', border: '1px solid var(--border)', minWidth: '140px' }}>
                            <button onClick={() => exportToExcel('page')}
                                className="w-full text-left px-3 py-2 text-xs hover:opacity-70 transition-all"
                                style={{ color: 'var(--text-primary)' }}>
                                Current page ({pageRows.length} rows)
                            </button>
                            <button onClick={() => exportToExcel('all')}
                                className="w-full text-left px-3 py-2 text-xs hover:opacity-70 transition-all"
                                style={{ color: 'var(--text-primary)', borderTop: '1px solid var(--border)' }}>
                                All filtered ({totalCount} rows)
                            </button>
                        </div>
                    </div>
                    {/* Info — text label so it's harder to miss */}
                    <button onClick={() => setInfoOpen(v => !v)}
                        className="flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-medium transition-all"
                        style={{
                            color: infoOpen ? 'var(--accent)' : 'var(--text-secondary)',
                            background: infoOpen ? 'var(--accent-dim)' : 'var(--glass-bg)',
                            border: '1px solid var(--border)',
                        }}>
                        <MdInfoOutline size={14} />
                        <span className="hidden sm:inline">How it works</span>
                    </button>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {totalCount.toLocaleString()} names
                    </span>
                </div>
            </div>

            {/* Info panel */}
            {infoOpen && (
                <div className="rounded-xl px-4 py-3 text-xs flex flex-col gap-3 flex-shrink-0"
                    style={{ background: 'var(--glass-bg)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex flex-col gap-3 min-w-0">
                            <div>
                                <p className="font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>Where do the numbers come from?</p>
                                <p className="mb-2"><strong>Price</strong> is live from Yahoo Finance. Everything else is <em>calculated</em> from official JPX earnings data (J-Quants):</p>
                                <div className="flex flex-col gap-1" style={{ color: 'var(--text-primary)' }}>
                                    <span><strong>P/E</strong> — price ÷ last 12 months of earnings per share</span>
                                    <span><strong>Fwd P/E</strong> — price ÷ company&apos;s own earnings forecast for next year</span>
                                    <span><strong>P/B</strong> — price ÷ book value per share (last annual report)</span>
                                    <span><strong>Div %</strong> — annual dividend ÷ current price</span>
                                    <span><strong>Mkt Cap</strong> — shares outstanding × current price</span>
                                </div>
                            </div>
                            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                                <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>How fresh is the data?</p>
                                <p>Earnings update quarterly — P/E and P/B may lag real-time sources by up to one quarter. Prices are always current. Click a ticker to open Yahoo Finance for live values.</p>
                            </div>
                            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                                <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Refreshing data</p>
                                <div className="flex flex-col gap-0.5">
                                    <span><strong>On open</strong> — prices appear instantly; ratios fill in within a few seconds</span>
                                    <span><strong>Load page</strong> — forces a fresh fetch for all visible rows</span>
                                    <span><strong>⟳ per row</strong> — refreshes a single stock immediately</span>
                                    <span><strong>Cache</strong> — data stored 24 h; page reloads restore without API calls</span>
                                </div>
                            </div>
                        </div>
                        <button onClick={() => setInfoOpen(false)} style={{ color: 'var(--text-muted)', flexShrink: 0 }}><MdClose size={15} /></button>
                    </div>
                </div>
            )}

            {/* Table */}
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto overscroll-none rounded-xl">
                <table className="data-table" style={{ tableLayout: 'fixed', width: '100%', minWidth: minTableWidth }}>
                    <thead className="sticky top-0 z-10" style={{ background: 'var(--table-header-bg)', backdropFilter: 'blur(12px)' }}>
                        {table.getHeaderGroups().map(hg => (
                            <tr key={hg.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                {hg.headers.map(header => {
                                    const canSort = header.column.getCanSort();
                                    const canResize = header.column.getCanResize();
                                    const isName = header.column.id === 'name';
                                    return (
                                        <th key={header.id}
                                            className={`px-2 py-2 sm:py-3 text-left text-xs font-semibold uppercase tracking-widest select-none relative align-top ${canSort ? 'cursor-pointer' : ''}`}
                                            style={{
                                                color: 'var(--text-muted)',
                                                width: header.getSize(),
                                            }}
                                            onClick={canSort ? header.column.getToggleSortingHandler() : undefined}>
                                            {/* Header label — allowed to wrap */}
                                            <span className="inline-flex items-start gap-1" style={{ maxWidth: '100%' }}>
                                                <span style={{ wordBreak: 'break-word' }}>
                                                    {flexRender(header.column.columnDef.header, header.getContext())}
                                                </span>
                                                {canSort && (() => {
                                                    const sorted = header.column.getIsSorted();
                                                    return (
                                                        <span style={{
                                                            color: sorted ? 'var(--accent)' : 'var(--text-muted)',
                                                            display: 'inline-block', width: 10, textAlign: 'center', flexShrink: 0, lineHeight: 1.2,
                                                            opacity: sorted ? 1 : 0.4,
                                                        }}>
                                                            {sorted === 'asc' ? '↑' : sorted === 'desc' ? '↓' : '⇅'}
                                                        </span>
                                                    );
                                                })()}
                                            </span>
                                            {/* Resize handle */}
                                            {canResize && (
                                                <div onMouseDown={header.getResizeHandler()} onTouchStart={header.getResizeHandler()}
                                                    onClick={e => e.stopPropagation()}
                                                    className="group/resize absolute top-0 h-full cursor-col-resize select-none touch-none"
                                                    style={{ width: 16, right: -8, zIndex: 2 }}>
                                                    <div className={header.column.getIsResizing() ? '' : 'opacity-0 group-hover/resize:opacity-100'}
                                                        style={{
                                                            position: 'absolute', left: '50%', top: '20%', bottom: '20%',
                                                            width: 1, transform: 'translateX(-50%)', borderRadius: 1,
                                                            background: 'var(--accent)', transition: 'opacity 0.1s',
                                                        }} />
                                                </div>
                                            )}
                                        </th>
                                    );
                                })}
                            </tr>
                        ))}
                    </thead>
                    <tbody>
                        {pageRows.map(row => (
                            <tr key={row.id}
                                className="group transition-colors hover:bg-[var(--glass-bg)]"
                                style={{ borderBottom: '1px solid var(--border)' }}>
                                {row.getVisibleCells().map(cell => {
                                    const isName = cell.column.id === 'name';
                                    return (
                                        <td key={cell.id}
                                            className={`px-2 py-2 sm:py-2.5 text-xs sm:text-sm ${isName ? 'truncate' : ''}`}
                                            style={{
                                                color: 'var(--text-primary)',
                                                width: cell.column.getSize(),
                                                overflow: 'hidden',
                                            }}>
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
                {totalCount === 0 && (
                    <div className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>No names match your filter</div>
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
