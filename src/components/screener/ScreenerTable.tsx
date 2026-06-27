'use client';

import React, { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
    MdShowChart, MdInfoOutline, MdDownload, MdFilterList, MdExpandMore, MdCheck,
} from 'react-icons/md';
import type { IndexConstituent, StockFundamentals, PriceAlert } from '../../types/screener';
import { useScreenerFundamentals, type FundEntry } from '../../hooks/useScreenerFundamentals';

const columnHelper = createColumnHelper<IndexConstituent>();
const PAGE_SIZE = 50;

type View = 'all' | 'loaded' | 'unloaded' | 'pinned' | 'alerts';

const muted = (text: string) => <span style={{ color: 'var(--text-muted)' }}>{text}</span>;

const fmtNum = (v: number, digits = 2) =>
    v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

const fmtPrice = (price: number, currency: string | null) =>
    currency === 'JPY'
        ? price.toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 1 })
        : fmtNum(price, 2);

const fmtCompact = (v: number) =>
    new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(v);

function isAlertTriggered(alert: PriceAlert, price: number | null): boolean {
    if (price == null) return false;
    if (alert.targetAbove != null && price >= alert.targetAbove) return true;
    if (alert.targetBelow != null && price <= alert.targetBelow) return true;
    return false;
}

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
    const [view, setView] = useState<View>('all');
    const [showAll, setShowAll] = useState(false);
    const [selectedSectors, setSelectedSectors] = useState<Set<string> | null>(null);
    const [sectorOpen, setSectorOpen] = useState(false);
    const [pageIndex, setPageIndex] = useState(0);
    const bp = useBreakpoints();

    const mapRef = useRef<Map<string, FundEntry>>(new Map());
    const sortingRef = useRef(sorting); sortingRef.current = sorting;
    const pinnedRef = useRef(pinnedSymbols); pinnedRef.current = pinnedSymbols;
    const alertsRef = useRef(alerts); alertsRef.current = alerts;
    const refreshRef = useRef<(symbol: string) => void>(() => {});
    const nameCacheRef = useRef<Map<string, string>>(new Map());

    const { map: fundMap, refresh, loadMany, loadCached, backfillSector, progress } = useScreenerFundamentals();
    mapRef.current = fundMap;
    refreshRef.current = refresh;

    // Effective page size: flat (no pagination) when not on All view, or when showAll is toggled.
    const effectivePageSize = view !== 'all' || showAll ? 99999 : PAGE_SIZE;

    const handleSetView = (v: View) => { setView(v); setShowAll(false); setPageIndex(0); };

    useEffect(() => { setPageIndex(0); }, [showAll]);

    const viewRows = useMemo(() => {
        if (view === 'loaded') return constituents.filter(c => fundMap.get(c.symbol)?.status === 'done');
        if (view === 'unloaded') return constituents.filter(c => fundMap.get(c.symbol)?.status !== 'done');
        if (view === 'pinned') return constituents.filter(c => pinnedSymbols.has(c.symbol));
        if (view === 'alerts') return constituents.filter(c => alerts[c.symbol] != null);
        return constituents;
    }, [view, constituents, pinnedSymbols, fundMap, alerts]);

    const allSectors = useMemo(() => {
        const s = new Set(constituents.map(c => c.sector).filter(Boolean) as string[]);
        return Array.from(s).sort();
    }, [constituents]);

    const sectorFilteredRows = useMemo(() => {
        if (!selectedSectors) return viewRows;
        return viewRows.filter(c => c.sector != null && selectedSectors.has(c.sector));
    }, [viewRows, selectedSectors]);

    const loadedCount = useMemo(
        () => constituents.filter(c => fundMap.get(c.symbol)?.status === 'done').length,
        [constituents, fundMap],
    );
    const unloadedCount = constituents.length - loadedCount;
    const alertsCount = useMemo(() => Object.keys(alerts).length, [alerts]);

    const toggleSector = (s: string) => {
        setSelectedSectors(prev => {
            if (prev === null) return new Set([s]);
            const next = new Set(prev);
            if (next.has(s)) { next.delete(s); return next.size === 0 ? null : next; }
            next.add(s);
            return next;
        });
    };

    const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };

    const columns = useMemo(() => {
        const numSort = (field: keyof StockFundamentals) =>
            (rowA: Row<IndexConstituent>, rowB: Row<IndexConstituent>, columnId: string): number => {
                const ea = mapRef.current.get(rowA.original.symbol);
                const eb = mapRef.current.get(rowB.original.symbol);
                const a = ea?.status === 'done' ? (ea.data[field] as number | null) : null;
                const b = eb?.status === 'done' ? (eb.data[field] as number | null) : null;
                if (a == null && b == null) return 0;
                const desc = sortingRef.current.find(s => s.id === columnId)?.desc ?? false;
                if (a == null) return desc ? -1 : 1;
                if (b == null) return desc ? 1 : -1;
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
                    const displayName = cached ?? fallback;
                    const currency = e?.status === 'done' ? (e.data.currency ?? null) : null;
                    const isLoaded = e?.status === 'done';
                    const fetchedAt = e?.status === 'done' ? e.fetchedAt : undefined;
                    const ratiosFetchedAt = e?.status === 'done' ? e.ratiosFetchedAt : undefined;
                    const priceAge = fetchedAt ? Date.now() - new Date(fetchedAt).getTime() : Infinity;
                    const ratioAge = ratiosFetchedAt ? Date.now() - new Date(ratiosFetchedAt).getTime() : Infinity;
                    const isStale = priceAge > 24 * 3600 * 1000 || ratioAge > 7 * 24 * 3600 * 1000;
                    const dotColor = !isLoaded ? 'var(--border-strong)'
                        : isStale ? 'oklch(68% 0.14 60)'
                        : 'var(--pnl-green)';
                    const fmt = (iso: string | null | undefined) => {
                        if (!iso) return null;
                        const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
                        if (h < 1) return 'just now';
                        if (h < 24) return `${h}h ago`;
                        return `${Math.floor(h / 24)}d ago`;
                    };
                    const AMBER = 'oklch(68% 0.14 60)';
                    const dotTooltip = isLoaded ? (
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {fetchedAt && (
                                <span style={{ color: priceAge < 24 * 3600 * 1000 ? 'var(--pnl-green)' : AMBER }}>
                                    price: {fmt(fetchedAt)}
                                </span>
                            )}
                            <span style={{ color: ratiosFetchedAt && ratioAge < 7 * 24 * 3600 * 1000 ? 'var(--pnl-green)' : AMBER }}>
                                {ratiosFetchedAt ? `ratios: ${fmt(ratiosFetchedAt)}` : 'ratios: not fetched'}
                            </span>
                        </span>
                    ) : null;
                    return (
                        <div className="flex items-center gap-1.5 w-full min-w-0">
                            {/* Custom CSS tooltip — absolute, escapes via td overflow:visible */}
                            <span className="relative group/dot flex-shrink-0" style={{ display: 'inline-flex', cursor: dotTooltip ? 'help' : 'default' }}>
                                <span className="rounded-full" style={{ width: 5, height: 5, background: dotColor, opacity: isLoaded ? 1 : 0.45 }} />
                                {dotTooltip && (
                                    <span className="pointer-events-none absolute bottom-full left-0 mb-1.5 z-50 hidden group-hover/dot:block whitespace-nowrap rounded-md px-2 py-1 text-xs"
                                        style={{ background: 'var(--surface-popover)', border: '1px solid var(--border)' }}>
                                        {dotTooltip}
                                    </span>
                                )}
                            </span>
                            <button
                                onClick={stop(() => onOpenChart(props.row.original, currency))}
                                className="text-left truncate hover:opacity-70 transition-opacity min-w-0 flex-1"
                                style={{ color: 'inherit' }}
                                title={displayName}>
                                {displayName}
                            </button>
                        </div>
                    );
                },
            }),
            columnHelper.accessor('sector', {
                header: 'Sector', size: 150, minSize: 80,
                cell: props => {
                    const sym = props.row.original.symbol;
                    const e = mapRef.current.get(sym);
                    const fetchedSector = e?.status === 'done' ? e.data.sector : undefined;
                    return (fetchedSector ?? props.getValue()) ?? muted('—');
                },
            }),
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
            columnHelper.accessor(() => null, {
                id: 'trailingPE', header: 'P/E', size: 58, minSize: 44,
                enableSorting: true, sortingFn: numSort('trailingPE'),
                cell: props => fundCell(props.row.original.symbol, d =>
                    d.trailingPE == null ? null : <span className="tabular-nums">{fmtNum(d.trailingPE, 1)}</span>, true),
            }),
            columnHelper.accessor(() => null, {
                id: 'forwardPE', header: 'Fwd P/E', size: 68, minSize: 52,
                enableSorting: true, sortingFn: numSort('forwardPE'),
                cell: props => fundCell(props.row.original.symbol, d =>
                    d.forwardPE == null ? null : <span className="tabular-nums">{fmtNum(d.forwardPE, 1)}</span>, true),
            }),
            columnHelper.accessor(() => null, {
                id: 'dividendYield', header: 'Div %', size: 62, minSize: 48,
                enableSorting: true, sortingFn: numSort('dividendYield'),
                cell: props => fundCell(props.row.original.symbol, d =>
                    d.dividendYield == null ? null : <span className="tabular-nums">{fmtNum(d.dividendYield * 100, 2)}%</span>, true),
            }),
            columnHelper.accessor(() => null, {
                id: 'priceToBook', header: 'P/B', size: 56, minSize: 44,
                enableSorting: true, sortingFn: numSort('priceToBook'),
                cell: props => fundCell(props.row.original.symbol, d =>
                    d.priceToBook == null ? null : <span className="tabular-nums">{fmtNum(d.priceToBook, 2)}</span>, true),
            }),
            columnHelper.accessor(() => null, {
                id: 'marketCap', header: 'Mkt Cap (¥)', size: 82, minSize: 60,
                enableSorting: true, sortingFn: numSort('marketCap'),
                cell: props => fundCell(props.row.original.symbol, d =>
                    d.marketCap == null ? null : <span className="tabular-nums">¥{fmtCompact(d.marketCap)}</span>, true),
            }),
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
                                title={(() => {
                                    if (!alert) return 'Set price alert';
                                    const parts: string[] = [];
                                    if (alert.targetAbove != null) parts.push(`↑ ${fmtNum(alert.targetAbove, 0)}`);
                                    if (alert.targetBelow != null) parts.push(`↓ ${fmtNum(alert.targetBelow, 0)}`);
                                    return `Alert ${parts.join(' · ')}${triggered ? ' · triggered' : ''}`;
                                })()}>
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

    const columnVisibility = useMemo(() => ({
        remove: (removableSymbols?.size ?? 0) > 0,
        sector: bp.lg,
        marketCap: bp.lg,
        forwardPE: bp.xl,
    }), [bp, removableSymbols]);

    const table = useReactTable({
        data: sectorFilteredRows,
        columns,
        state: {
            sorting,
            globalFilter: filter,
            columnVisibility,
            pagination: { pageIndex, pageSize: effectivePageSize },
        },
        onSortingChange: setSorting,
        onGlobalFilterChange: setFilter,
        onPaginationChange: updater => {
            const prev = { pageIndex, pageSize: effectivePageSize };
            const next = typeof updater === 'function' ? updater(prev) : updater;
            setPageIndex(next.pageIndex);
        },
        globalFilterFn: (row, _columnId, value) => {
            const q = String(value).toLowerCase();
            const c = row.original;
            return c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
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
    const pageLoading = progress !== null;

    // Restore from DB cache for all constituents on mount and universe changes.
    useEffect(() => {
        loadCached(constituents.map(c => c.symbol));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [constituents.length, loadCached]);

    // Auto-ensure custom-added symbols have complete data whenever the set changes.
    // Fires after page.tsx loads persisted symbols from localStorage (they arrive async,
    // so this cannot be a mount-only effect). Uses mapRef snapshot — not fundMap state —
    // to avoid a render loop.
    //   - No entry or ratiosPending → full fetch (loadMany shows loading, like Refresh)
    //   - Has full data but no sector → silent backfill (keeps existing data visible)
    useEffect(() => {
        if (!removableSymbols || removableSymbols.size === 0) return;
        const toFetch: string[] = [];
        const toBackfill: string[] = [];
        for (const s of removableSymbols) {
            const e = mapRef.current.get(s);
            if (!e || (e.status === 'done' && e.ratiosPending)) {
                toFetch.push(s);
            } else if (e.status === 'done' && !e.ratiosPending && e.data.sector == null) {
                toBackfill.push(s);
            }
        }
        if (toFetch.length > 0) loadMany(toFetch);
        if (toBackfill.length > 0) backfillSector(toBackfill);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [removableSymbols]);

    // Per-page cache probe — skipped in show-all mode (all already loaded above).
    useEffect(() => { if (!showAll) loadCached(pageSymbols); }, [pageSymbols, loadCached, showAll]);

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

    const curPageIndex = table.getState().pagination.pageIndex;
    const pageCount = table.getPageCount();
    const minTableWidth = table.getVisibleLeafColumns().reduce((sum, c) => sum + (c.columnDef.minSize ?? 40), 0);

    const viewTab = (id: View, label: string, count: number) => (
        <button
            key={id}
            onClick={() => handleSetView(id)}
            className="h-full px-2.5 text-sm font-medium transition-all rounded-md flex items-center gap-1"
            style={view === id
                ? { background: 'var(--accent-dim)', color: 'var(--accent)' }
                : { color: 'var(--text-secondary)' }}
        >
            {label} <span style={{ opacity: 0.6 }}>({count.toLocaleString()})</span>
        </button>
    );

    return (
        <div className="glass rounded-2xl p-3 sm:p-4 flex flex-col gap-3 h-full">
            {/* Single controls row — all elements h-9 for uniform height */}
            <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
                {/* Search */}
                <div className="relative" style={{ flex: '1 1 140px', maxWidth: 260 }}>
                    <MdSearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                    <input value={filter} onChange={e => setFilter(e.target.value)}
                        placeholder="Filter by ticker or name…"
                        className="w-full h-9 pl-9 pr-3 rounded-lg text-sm glass outline-none focus:ring-1"
                        style={{ color: 'var(--text-primary)', caretColor: 'var(--accent)', ['--tw-ring-color' as string]: 'var(--accent)' }} />
                </div>

                {/* Sector dropdown */}
                <div className="relative flex-shrink-0">
                    <button
                        onClick={() => setSectorOpen(o => !o)}
                        className="h-9 flex items-center gap-1 px-3 rounded-lg text-sm font-medium transition-all"
                        style={{
                            color: selectedSectors ? 'var(--accent)' : 'var(--text-secondary)',
                            background: selectedSectors ? 'var(--accent-dim)' : 'var(--glass-bg)',
                            border: `1px solid ${selectedSectors ? 'var(--accent-glow)' : 'var(--border)'}`,
                        }}
                    >
                        <MdFilterList size={14} />
                        <span className="hidden sm:inline">
                            {selectedSectors ? `${selectedSectors.size} sector${selectedSectors.size !== 1 ? 's' : ''}` : 'Sector'}
                        </span>
                        <MdExpandMore size={13} />
                    </button>
                    {sectorOpen && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={() => setSectorOpen(false)} />
                            <div className="absolute left-0 top-full mt-1 z-20 rounded-xl py-1 overflow-y-auto"
                                style={{
                                    background: 'var(--surface-popover)',
                                    border: '1px solid var(--border-strong)',
                                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                                    minWidth: 200,
                                    maxHeight: 280,
                                }}>
                                <button
                                    onClick={() => { setSelectedSectors(null); setSectorOpen(false); }}
                                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-all hover:opacity-70 text-left"
                                    style={{
                                        color: !selectedSectors ? 'var(--accent)' : 'var(--text-secondary)',
                                        fontWeight: !selectedSectors ? 500 : 400,
                                        borderBottom: '1px solid var(--border)',
                                    }}>
                                    {!selectedSectors && <MdCheck size={12} />}
                                    <span className={!selectedSectors ? '' : 'pl-4'}>All sectors</span>
                                </button>
                                {allSectors.map(sector => {
                                    const active = selectedSectors?.has(sector) ?? false;
                                    return (
                                        <button key={sector}
                                            onClick={() => toggleSector(sector)}
                                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-all hover:opacity-70 text-left"
                                            style={{ color: active ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: active ? 500 : 400 }}>
                                            {active ? <MdCheck size={12} /> : <span style={{ width: 12, display: 'inline-block' }} />}
                                            {sector}
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>

                {/* View tabs */}
                <div className="inline-flex h-9 items-center rounded-lg p-1 gap-0.5 flex-shrink-0"
                    style={{ background: 'var(--glass-bg)', border: '1px solid var(--border)' }}>
                    {viewTab('all', 'All', constituents.length)}
                    {viewTab('loaded', 'Loaded', loadedCount)}
                    {viewTab('unloaded', 'Not loaded', unloadedCount)}
                    {viewTab('pinned', 'Pinned', pinnedSymbols.size)}
                    {viewTab('alerts', 'Alerts', alertsCount)}
                </div>

                {/* Actions — pushed to the right */}
                <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
                    <button onClick={() => loadMany(pageSymbols)} disabled={pageLoading || pageSymbols.length === 0}
                        className="h-9 flex items-center gap-1.5 px-3 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                        style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-glow)' }}>
                        <MdRefresh size={14} className={pageLoading ? 'animate-spin' : ''} />
                        <span className="hidden sm:inline">
                            {progress
                                ? `${progress.done}/${progress.total}…`
                                : showAll ? 'Refresh all' : 'Refresh page'}
                        </span>
                        <span className="sm:hidden">{progress ? `${progress.done}/${progress.total}` : '↻'}</span>
                    </button>
                    <div className="relative group/export">
                        <button className="h-9 flex items-center gap-1 px-3 rounded-lg text-sm font-medium transition-all"
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
                    <button onClick={() => setInfoOpen(v => !v)}
                        className="h-9 flex items-center gap-1 px-2.5 rounded-lg text-sm font-medium transition-all"
                        style={{
                            color: infoOpen ? 'var(--accent)' : 'var(--text-secondary)',
                            background: infoOpen ? 'var(--accent-dim)' : 'var(--glass-bg)',
                            border: '1px solid var(--border)',
                        }} title="How it works">
                        <MdInfoOutline size={14} />
                    </button>
                </div>
            </div>

            {/* Info panel — 4-column layout */}
            {infoOpen && (
                <div className="rounded-xl px-4 py-3 text-xs flex-shrink-0"
                    style={{ background: 'var(--glass-bg)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                    <div className="flex items-center justify-between gap-2 mb-3">
                        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>How it works</span>
                        <button onClick={() => setInfoOpen(false)} style={{ color: 'var(--text-muted)' }}><MdClose size={15} /></button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0' }}>
                        {/* Col 1 — Metrics */}
                        <div className="flex flex-col gap-0.5" style={{ paddingRight: '1.25rem', borderRight: '1px solid var(--border)' }}>
                            <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Metrics</p>
                            <span><strong>Price</strong> — live, Yahoo Finance</span>
                            <span><strong>P/E</strong> — price ÷ trailing EPS</span>
                            <span><strong>Fwd P/E</strong> — price ÷ next-year EPS</span>
                            <span><strong>P/B</strong> — price ÷ book value</span>
                            <span><strong>Div %</strong> — annual dividend yield</span>
                            <span><strong>Mkt Cap</strong> — shares × price</span>
                            <p className="mt-2" style={{ color: 'var(--text-muted)' }}>
                                JP ratios from J-Quants, others from Yahoo. Update quarterly.
                            </p>
                        </div>
                        {/* Col 2 — Universe + Dot legend */}
                        <div className="flex flex-col gap-3" style={{ padding: '0 1.25rem', borderRight: '1px solid var(--border)' }}>
                            <div>
                                <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Universe</p>
                                <p>BlackRock iShares 1475 ETF holdings — <strong>names only</strong>. Header date is the list snapshot, not data freshness.</p>
                            </div>
                            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}>
                                <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Row dot</p>
                                <div className="flex flex-col gap-1">
                                    <span className="flex items-center gap-2">
                                        <span className="rounded-full flex-shrink-0" style={{ width: 7, height: 7, background: 'var(--pnl-green)', display: 'inline-block' }} />
                                        Fresh — price &lt;24 h, ratios &lt;7 d
                                    </span>
                                    <span className="flex items-center gap-2">
                                        <span className="rounded-full flex-shrink-0" style={{ width: 7, height: 7, background: 'oklch(68% 0.14 60)', display: 'inline-block' }} />
                                        Stale — price &gt;24 h or ratios &gt;7 d
                                    </span>
                                    <span className="flex items-center gap-2">
                                        <span className="rounded-full flex-shrink-0" style={{ width: 7, height: 7, background: 'var(--border-strong)', opacity: 0.45, display: 'inline-block' }} />
                                        Not loaded
                                    </span>
                                </div>
                                <p className="mt-2" style={{ color: 'var(--text-muted)' }}>Hover the dot for exact ages.</p>
                            </div>
                        </div>
                        {/* Col 3 — Loading */}
                        <div className="flex flex-col gap-0.5" style={{ padding: '0 1.25rem', borderRight: '1px solid var(--border)' }}>
                            <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Loading</p>
                            <span><strong>On open</strong> — restores from localStorage, falls back to DB</span>
                            <span><strong>Refresh page</strong> — live Yahoo fetch for 50 visible rows</span>
                            <span><strong>Refresh all</strong> — all rows in Show all mode</span>
                            <span><strong>⟳ per row</strong> — single stock on demand</span>
                            <span><strong>Loaded tab</strong> — rows with data, no pagination</span>
                            <span><strong>Show all</strong> — full list, one page</span>
                            <p className="mt-2" style={{ color: 'var(--text-muted)' }}>
                                Prices expire after 24 h, ratios after 7 d. Stale data shows immediately.
                            </p>
                        </div>
                        {/* Col 4 — Price alerts */}
                        <div className="flex flex-col gap-0.5" style={{ paddingLeft: '1.25rem' }}>
                            <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Price alerts</p>
                            <span><strong>Bell icon</strong> — set above/below thresholds on any row</span>
                            <span><strong>Polling</strong> — alerted stocks re-fetched every hour while page is open</span>
                            <span><strong>Notification</strong> — browser push when threshold crossed; edit alert to reset</span>
                            <span><strong>Alerts tab</strong> — filter to rows with an alert set</span>
                            <p className="mt-2" style={{ color: 'var(--text-muted)' }}>
                                Checks require this tab to be open. Permission requested on first save.
                            </p>
                        </div>
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
                                    return (
                                        <th key={header.id}
                                            className={`px-2 py-2 sm:py-3 text-left text-xs font-semibold uppercase tracking-widest select-none relative align-top ${canSort ? 'cursor-pointer' : ''}`}
                                            style={{ color: 'var(--text-muted)', width: header.getSize() }}
                                            onClick={canSort ? header.column.getToggleSortingHandler() : undefined}>
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
                                            className="px-2 py-2 sm:py-2.5 text-xs sm:text-sm"
                                            style={{
                                                color: 'var(--text-primary)',
                                                width: cell.column.getSize(),
                                                // Name cell: visible so the dot tooltip can escape the cell.
                                                // Text truncation is handled by the inner flex container.
                                                overflow: isName ? 'visible' : 'hidden',
                                                position: isName ? 'relative' : undefined,
                                                maxWidth: isName ? cell.column.getSize() : undefined,
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
                    <div className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>
                        {view === 'loaded' ? 'No data loaded yet — click "Refresh page" to load the current page' :
                            view === 'unloaded' ? 'All names have been loaded' :
                            view === 'pinned' ? 'No pinned names — click the star on any row to pin it' :
                            view === 'alerts' ? 'No price alerts set — click the bell icon on any row' :
                                'No names match your filter'}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 flex-shrink-0 text-xs" style={{ color: 'var(--text-muted)' }}>
                <span>
                    {view === 'all' && !showAll && `Page ${curPageIndex + 1} of ${pageCount}`}
                    {view === 'all' && showAll && `${totalCount.toLocaleString()} names`}
                    {view === 'loaded' && `${totalCount.toLocaleString()} rows with data`}
                    {view === 'unloaded' && `${totalCount.toLocaleString()} rows without data`}
                    {view === 'pinned' && `${totalCount.toLocaleString()} pinned`}
                    {view === 'alerts' && `${totalCount.toLocaleString()} with alerts`}
                    {loadedCount > 0 && view === 'all' && (
                        <span style={{ color: 'var(--pnl-green)', marginLeft: 8 }}>
                            · {loadedCount.toLocaleString()} loaded
                        </span>
                    )}
                </span>
                <div className="flex items-center gap-2">
                    {/* Show all / Paginate toggle — only for All view */}
                    {view === 'all' && (
                        <button
                            onClick={() => startTransition(() => { setShowAll(o => !o); })}
                            className="px-2.5 py-1.5 rounded-lg transition-all"
                            style={{ color: showAll ? 'var(--accent)' : 'var(--text-secondary)', border: '1px solid var(--border)', background: showAll ? 'var(--accent-dim)' : 'transparent' }}
                        >
                            {showAll ? 'Paginate' : 'Show all'}
                        </button>
                    )}
                    {/* Prev / Next — only when paginated */}
                    {view === 'all' && !showAll && pageCount > 1 && (
                        <>
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
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
