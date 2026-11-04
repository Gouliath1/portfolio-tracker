'use client';

import type { ChartSpec } from '../../utils/chatRichText';
import { formatChartValue } from '../../utils/chatRichText';
import { useTranslation } from '../../i18n';

/**
 * A small chart drawn from a validated spec. Everything the chart says is also
 * written out as text (values beside the bars, a legend with shares), so it
 * reads without colour or sight and nothing depends on hovering.
 *
 * Mid-lightness colours so the same palette holds on the light and dark
 * surfaces; no chart library, since two shapes are all the chat needs.
 */

const PALETTE = [
    'oklch(52% 0.22 275)', 'oklch(60% 0.15 158)', 'oklch(68% 0.15 75)', 'oklch(58% 0.17 16)',
    'oklch(62% 0.12 215)', 'oklch(58% 0.16 320)', 'oklch(66% 0.12 120)', 'oklch(55% 0.03 275)',
];
const colorAt = (i: number) => PALETTE[i % PALETTE.length];

function BarChart({ spec, locale }: { spec: ChartSpec; locale: string }) {
    const values = spec.data.map(d => d.value);
    const max = Math.max(0, ...values);
    const min = Math.min(0, ...values);
    const range = max - min || 1;
    const zero = (-min / range) * 100;           // where value 0 sits, % of the track
    const signed = min < 0 && max > 0;

    return (
        <ul className="space-y-1.5">
            {spec.data.map((d, i) => {
                const width = (Math.abs(d.value) / range) * 100;
                const left = d.value >= 0 ? zero : zero - width;
                const color = signed || min < 0
                    ? (d.value >= 0 ? 'var(--pnl-green)' : 'var(--pnl-red)')
                    : 'var(--accent)';
                return (
                    <li key={`${d.label}-${i}`} className="grid grid-cols-[minmax(0,6.5rem)_1fr_auto] items-center gap-2 text-xs">
                        <span className="truncate" title={d.label} style={{ color: 'var(--text-secondary)' }}>{d.label}</span>
                        <span className="relative h-2.5 rounded-sm" style={{ background: 'var(--accent-dim)' }} aria-hidden="true">
                            <span className="absolute top-0 bottom-0 rounded-sm"
                                style={{ left: `${left}%`, width: `${Math.max(width, 1.5)}%`, background: color }} />
                        </span>
                        <span className="tabular-nums text-right min-w-[3.5rem]" style={{ color: 'var(--text-primary)' }}>
                            {formatChartValue(d.value, spec.unit, locale)}
                        </span>
                    </li>
                );
            })}
        </ul>
    );
}

function DonutChart({ spec, locale }: { spec: ChartSpec; locale: string }) {
    const total = spec.data.reduce((s, d) => s + d.value, 0);
    const R = 40;
    const C = 2 * Math.PI * R;
    let offset = 0;

    return (
        <div className="flex items-center gap-4">
            <svg viewBox="0 0 100 100" className="w-24 h-24 flex-shrink-0 -rotate-90" aria-hidden="true">
                <circle cx="50" cy="50" r={R} fill="none" stroke="var(--accent-dim)" strokeWidth="16" />
                {spec.data.map((d, i) => {
                    const len = (d.value / total) * C;
                    const seg = (
                        <circle key={`${d.label}-${i}`} cx="50" cy="50" r={R} fill="none"
                            stroke={colorAt(i)} strokeWidth="16"
                            strokeDasharray={`${Math.max(len - 0.8, 0)} ${C}`} strokeDashoffset={-offset} />
                    );
                    offset += len;
                    return seg;
                })}
            </svg>
            <ul className="flex-1 min-w-0 space-y-1">
                {spec.data.map((d, i) => (
                    <li key={`${d.label}-${i}`} className="flex items-center gap-2 text-xs">
                        <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: colorAt(i) }} aria-hidden="true" />
                        <span className="truncate flex-1" title={d.label} style={{ color: 'var(--text-secondary)' }}>{d.label}</span>
                        <span className="tabular-nums" style={{ color: 'var(--text-primary)' }}>
                            {formatChartValue((d.value / total) * 100, '%', locale)}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export function ChatChart({ spec }: { spec: ChartSpec }) {
    const { t, locale } = useTranslation();
    const summary = spec.data.map(d => `${d.label} ${formatChartValue(d.value, spec.unit, locale)}`).join(', ');

    return (
        <figure className="my-2 max-w-md rounded-lg px-3 py-2.5" style={{ border: '1px solid var(--border)', background: 'var(--surface-popover)' }}
            role="img" aria-label={t('chat.chartAria', { title: spec.title ?? '', data: summary })}>
            {spec.title && (
                <figcaption className="text-xs font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{spec.title}</figcaption>
            )}
            {spec.type === 'bar' ? <BarChart spec={spec} locale={locale} /> : <DonutChart spec={spec} locale={locale} />}
        </figure>
    );
}
