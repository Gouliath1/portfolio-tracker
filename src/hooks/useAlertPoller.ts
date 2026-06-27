'use client';

import { useEffect, useRef } from 'react';
import type { PriceAlert } from '../types/screener';
import type { StockFundamentals } from '../types/screener';

const POLL_INTERVAL = 60 * 60 * 1000;

async function fetchPrice(symbol: string): Promise<{ price: number | null; currency: string | null }> {
    try {
        const res = await fetch(`/api/screener/quote?symbol=${encodeURIComponent(symbol)}&tier=price&fresh=1`);
        if (!res.ok) return { price: null, currency: null };
        const d = (await res.json()) as StockFundamentals;
        return { price: d.price ?? null, currency: d.currency ?? null };
    } catch {
        return { price: null, currency: null };
    }
}

function fmtAlertPrice(v: number, currency: string | null) {
    return currency === 'JPY'
        ? `¥${v.toLocaleString('en', { maximumFractionDigits: 0 })}`
        : v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function sendNotification(symbol: string, side: 'above' | 'below', price: number, target: number, currency: string | null) {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const priceFmt = fmtAlertPrice(price, currency);
    const targetFmt = fmtAlertPrice(target, currency);
    const body = side === 'above'
        ? `Crossed above ${targetFmt} — now ${priceFmt}`
        : `Dropped below ${targetFmt} — now ${priceFmt}`;
    new Notification(symbol, { body, icon: '/favicon.ico' });
}

export function useAlertPoller(alerts: Record<string, PriceAlert>) {
    const alertsRef = useRef(alerts);
    alertsRef.current = alerts;

    const firedRef = useRef<Set<string>>(new Set());
    const prevAlertsJsonRef = useRef('');

    // Clear fired cache when thresholds change so edits get re-evaluated on next poll.
    useEffect(() => {
        const json = JSON.stringify(alerts);
        if (json !== prevAlertsJsonRef.current) {
            prevAlertsJsonRef.current = json;
            firedRef.current.clear();
        }
    });

    // Restart interval when the set of alert symbols changes (new alert added/removed).
    const symbolKey = Object.keys(alerts).sort().join(',');

    useEffect(() => {
        const poll = async () => {
            const current = alertsRef.current;
            const symbols = Object.keys(current);
            if (symbols.length === 0) return;

            await Promise.all(symbols.map(async symbol => {
                const alert = current[symbol];
                const { price, currency } = await fetchPrice(symbol);
                if (price == null) return;

                if (alert.targetAbove != null && price >= alert.targetAbove) {
                    const key = `${symbol}:above`;
                    if (!firedRef.current.has(key)) {
                        firedRef.current.add(key);
                        sendNotification(symbol, 'above', price, alert.targetAbove, currency);
                    }
                }
                if (alert.targetBelow != null && price <= alert.targetBelow) {
                    const key = `${symbol}:below`;
                    if (!firedRef.current.has(key)) {
                        firedRef.current.add(key);
                        sendNotification(symbol, 'below', price, alert.targetBelow, currency);
                    }
                }
            }));
        };

        const onVisible = () => { if (document.visibilityState === 'visible') poll(); };
        document.addEventListener('visibilitychange', onVisible);

        poll();
        const id = setInterval(poll, POLL_INTERVAL);
        return () => {
            clearInterval(id);
            document.removeEventListener('visibilitychange', onVisible);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [symbolKey]);
}
