'use client';

import { useEffect, useRef } from 'react';
import type { PriceAlert } from '../types/screener';
import type { StockFundamentals } from '../types/screener';
import { useTranslation } from '../i18n';
import type { TranslationKey, TranslationParams } from '../i18n';

type Translator = (key: TranslationKey, params?: TranslationParams) => string;

const POLL_INTERVAL = 60 * 60 * 1000;

/** Alerts want a reasonably current price, but never fresher than the server's floor. */
const ALERT_MAX_AGE_MINUTES = 30;
const ALERT_CHUNK = 50;

/** One request per 50 alert symbols; the server answers from the shared cache when it can. */
async function fetchPrices(symbols: string[]): Promise<Record<string, { price: number | null; currency: string | null }>> {
    const out: Record<string, { price: number | null; currency: string | null }> = {};
    for (let i = 0; i < symbols.length; i += ALERT_CHUNK) {
        const chunk = symbols.slice(i, i + ALERT_CHUNK);
        try {
            const res = await fetch('/api/screener/refresh', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ symbols: chunk, tier: 'price', maxAgeMinutes: ALERT_MAX_AGE_MINUTES }),
            });
            if (!res.ok) continue;
            const { results } = (await res.json()) as { results: Record<string, StockFundamentals> };
            for (const [s, d] of Object.entries(results)) out[s] = { price: d.price ?? null, currency: d.currency ?? null };
        } catch { /* try again next poll */ }
    }
    return out;
}

function fmtAlertPrice(v: number, currency: string | null, locale: string) {
    return currency === 'JPY'
        ? `¥${v.toLocaleString(locale, { maximumFractionDigits: 0 })}`
        : v.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function sendNotification(
    symbol: string,
    side: 'above' | 'below',
    price: number,
    target: number,
    currency: string | null,
    t: Translator,
    locale: string,
) {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const params = {
        target: fmtAlertPrice(target, currency, locale),
        price: fmtAlertPrice(price, currency, locale),
    };
    const body = t(side === 'above' ? 'alert.notifyAbove' : 'alert.notifyBelow', params);
    new Notification(symbol, { body, icon: '/favicon.ico' });
}

export function useAlertPoller(alerts: Record<string, PriceAlert>) {
    const { t, locale } = useTranslation();
    const alertsRef = useRef(alerts);
    alertsRef.current = alerts;

    // Held in a ref so the poll interval isn't torn down and restarted every
    // time the language changes — notifications simply use the latest one.
    const i18nRef = useRef({ t, locale });
    i18nRef.current = { t, locale };

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

            // Hidden tabs don't poll, and with several tabs open only one does:
            // N tabs must not mean N times the traffic.
            if (document.visibilityState !== 'visible') return;
            const run = async () => {
                const prices = await fetchPrices(symbols);
                evaluate(current, symbols, prices);
            };
            if (typeof navigator !== 'undefined' && navigator.locks) {
                await navigator.locks.request('pt-alert-poll', { ifAvailable: true }, async lock => {
                    if (lock) await run();
                });
            } else {
                await run();
            }
        };

        const evaluate = (
            current: Record<string, PriceAlert>,
            symbols: string[],
            prices: Record<string, { price: number | null; currency: string | null }>,
        ) => {
            symbols.forEach(symbol => {
                const alert = current[symbol];
                const { price, currency } = prices[symbol] ?? { price: null, currency: null };
                if (price == null) return;

                if (alert.targetAbove != null && price >= alert.targetAbove) {
                    const key = `${symbol}:above`;
                    if (!firedRef.current.has(key)) {
                        firedRef.current.add(key);
                        sendNotification(symbol, 'above', price, alert.targetAbove, currency, i18nRef.current.t, i18nRef.current.locale);
                    }
                }
                if (alert.targetBelow != null && price <= alert.targetBelow) {
                    const key = `${symbol}:below`;
                    if (!firedRef.current.has(key)) {
                        firedRef.current.add(key);
                        sendNotification(symbol, 'below', price, alert.targetBelow, currency, i18nRef.current.t, i18nRef.current.locale);
                    }
                }
            });
        };

        const onVisible = () => { if (document.visibilityState === 'visible') poll(); };
        document.addEventListener('visibilitychange', onVisible);

        poll();
        const id = setInterval(poll, POLL_INTERVAL);
        return () => {
            clearInterval(id);
            document.removeEventListener('visibilitychange', onVisible);
        };
        // Everything the poll reads lives in a ref, so `symbolKey` is the only
        // real dependency — the interval survives language and alert edits.
    }, [symbolKey]);
}
