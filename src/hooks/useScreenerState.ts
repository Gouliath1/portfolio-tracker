'use client';

import { useCallback, useEffect, useState } from 'react';
import type { IndexConstituent, PriceAlert } from '../types/screener';
import {
    DEFAULT_SCREENER_STATE, readScreenerState, writeScreenerState, mergeWatchlist,
    type ScreenerState, type WatchlistItem,
} from '../utils/screenerState';

/**
 * Persisted screener state (universe, added tickers, pins, alerts, notes),
 * hydrated from localStorage after mount and written back on every change.
 */
export function useScreenerState() {
    const [state, setState] = useState<ScreenerState>(DEFAULT_SCREENER_STATE);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        setState(readScreenerState());
        setLoaded(true);
    }, []);

    useEffect(() => {
        if (loaded) writeScreenerState(state);
    }, [loaded, state]);

    const setIndex = useCallback((index: string, indexLoaded: boolean) => {
        setState(s => ({ ...s, index, indexLoaded }));
    }, []);
    const setIndexLoaded = useCallback((indexLoaded: boolean) => {
        setState(s => ({ ...s, indexLoaded }));
    }, []);

    const addTicker = useCallback((c: IndexConstituent) => {
        setState(s => (s.added.some(p => p.symbol === c.symbol) ? s : { ...s, added: [c, ...s.added] }));
    }, []);
    const addMany = useCallback((cs: IndexConstituent[]) => {
        setState(s => {
            const have = new Set(s.added.map(p => p.symbol));
            const fresh = cs.filter(c => !have.has(c.symbol));
            return fresh.length ? { ...s, added: [...fresh, ...s.added] } : s;
        });
    }, []);
    const removeTicker = useCallback((symbol: string) => {
        setState(s => ({ ...s, added: s.added.filter(p => p.symbol !== symbol) }));
    }, []);

    const togglePin = useCallback((symbol: string) => {
        setState(s => ({
            ...s,
            pinned: s.pinned.includes(symbol) ? s.pinned.filter(p => p !== symbol) : [...s.pinned, symbol],
        }));
    }, []);

    const setAlert = useCallback((symbol: string, alert: PriceAlert | null) => {
        setState(s => {
            const alerts = { ...s.alerts };
            if (alert) alerts[symbol] = alert; else delete alerts[symbol];
            return { ...s, alerts };
        });
    }, []);
    const setNote = useCallback((symbol: string, note: string | null) => {
        setState(s => {
            const notes = { ...s.notes };
            if (note) notes[symbol] = note; else delete notes[symbol];
            return { ...s, notes };
        });
    }, []);

    const importWatchlist = useCallback((items: WatchlistItem[], index: IndexConstituent[]) => {
        setState(s => mergeWatchlist(s, items, index));
    }, []);

    return {
        ...state, loaded,
        setIndex, setIndexLoaded, addTicker, addMany, removeTicker,
        togglePin, setAlert, setNote, importWatchlist,
    };
}
