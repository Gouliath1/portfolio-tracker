'use client';

import { useEffect, useState } from 'react';
import { getActivePositions } from '../../utils/localPositions';
import { BaseCurrency } from '../../hooks/useBaseCurrency';

interface ExchangeRatesSectionProps {
    /** Whether the settings drawer is open — rates are (re)fetched on open. */
    open: boolean;
    /** Current base currency — every rate converts a holding currency into this. */
    currency: BaseCurrency;
}

interface RateRow {
    pair: string;
    from: string;
    to: string;
    rate: number | null;
    date?: string;
}

const formatRate = (n: number) =>
    n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });

/**
 * Read-only list of the current FX rates used to value the portfolio. Shows one
 * row per holding currency (stockCcy -> base). The rates mirror exactly what the
 * dashboard uses (same /api/fx-rates source), i.e. the latest settled daily
 * close — so this doubles as an audit surface for the close-vs-spot behaviour.
 */
export const ExchangeRatesSection = ({ open, currency }: ExchangeRatesSectionProps) => {
    const [rows, setRows] = useState<RateRow[] | null>(null);
    const [asOf, setAsOf] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;

        (async () => {
            setRows(null);
            setAsOf(null);

            const fromCurrencies = [...new Set(
                getActivePositions()
                    .map(p => p.stockCcy as string)
                    .filter(ccy => Boolean(ccy) && ccy !== currency),
            )].sort();

            if (fromCurrencies.length === 0) {
                if (!cancelled) setRows([]);
                return;
            }

            const results = await Promise.all(fromCurrencies.map(async (from): Promise<RateRow> => {
                const pair = `${from}${currency}`;
                try {
                    const res = await fetch(`/api/fx-rates?pair=${encodeURIComponent(pair)}`);
                    if (res.ok) {
                        const data = await res.json();
                        return { pair, from, to: currency, rate: data.rate ?? null, date: data.date };
                    }
                } catch {
                    // Network/parse error -> render as unavailable.
                }
                return { pair, from, to: currency, rate: null };
            }));

            if (cancelled) return;
            setRows(results);
            setAsOf(results.find(r => r.date)?.date ?? null);
        })();

        return () => { cancelled = true; };
    }, [open, currency]);

    return (
        <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: 'var(--text-muted)' }}>
                Exchange Rates
            </h3>

            <div className="glass rounded-xl p-4 space-y-3">
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Rates used to convert your holdings into {currency} — the latest settled daily
                    close. Updates when you press Refresh.
                </p>

                {rows === null && (
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading rates…</p>
                )}

                {rows && rows.length === 0 && (
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        All holdings are already in {currency} — no conversion needed.
                    </p>
                )}

                {rows && rows.length > 0 && (
                    <ul className="space-y-2">
                        {rows.map(r => (
                            <li key={r.pair} className="flex items-center justify-between text-sm">
                                <span style={{ color: 'var(--text-secondary)' }}>
                                    {r.from} <span style={{ color: 'var(--text-muted)' }}>→</span> {r.to}
                                </span>
                                <span className="font-medium tabular-nums"
                                    style={{ color: 'var(--text-primary)' }}>
                                    {r.rate !== null ? formatRate(r.rate) : '—'}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}

                {asOf && rows && rows.length > 0 && (
                    <p className="text-xs pt-1" style={{ color: 'var(--text-muted)' }}>
                        as of {asOf}
                    </p>
                )}
            </div>
        </section>
    );
};
