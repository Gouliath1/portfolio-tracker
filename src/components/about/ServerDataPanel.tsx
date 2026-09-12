'use client';

/**
 * "Your data on the server" — the exact contents of the one row the server can
 * ever hold about a user's portfolio.
 *
 * The app's central claim is that holdings stay in the browser, with a single
 * opt-in exception. A claim like that is only checkable if the exception is
 * shown in full, so this lists the stored row column by column, and reports
 * whether one exists for this browser right now.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from '../../i18n';
import type { TranslationKey } from '../../i18n';
import { getActiveSetId } from '../../utils/localPositions';
import { readToken, fetchShareStatus } from '../../utils/aiConnection';

/** The columns of `portfolio_shares`, in the order the table declares them. */
const COLUMNS: { column: string; descKey: TranslationKey }[] = [
    { column: 'token_hash', descKey: 'about.colTokenHash' },
    { column: 'snapshot',   descKey: 'about.colSnapshot' },
    { column: 'markdown',   descKey: 'about.colMarkdown' },
    { column: 'expires_at', descKey: 'about.colExpires' },
];

type Stored =
    | { kind: 'loading' }
    | { kind: 'none' }
    | { kind: 'stored'; updatedAt?: string; expiresAt?: string };

export function ServerDataPanel() {
    const { t, locale } = useTranslation();
    const [stored, setStored] = useState<Stored>({ kind: 'loading' });

    useEffect(() => {
        let cancelled = false;
        const token = (() => {
            try { return readToken(getActiveSetId()); } catch { return null; }
        })();

        if (!token) {
            setStored({ kind: 'none' });
            return;
        }

        void fetchShareStatus(token).then(status => {
            if (cancelled) return;
            setStored(status.active
                ? { kind: 'stored', updatedAt: status.updatedAt, expiresAt: status.expiresAt }
                : { kind: 'none' });
        });
        return () => { cancelled = true; };
    }, []);

    const date = (iso?: string) =>
        iso ? new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

    const isStored = stored.kind === 'stored';

    return (
        <section className="glass rounded-xl p-4 sm:p-6">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {t('about.serverDataTitle')}
            </h2>

            {/* Live state first — the answer to "is anything of mine up there?" */}
            <div
                className="mt-3 rounded-xl px-4 py-3 flex items-start gap-2.5"
                style={{
                    background: isStored ? 'var(--accent-dim)' : 'var(--table-row-alt)',
                    border: `1px solid ${isStored ? 'var(--accent-glow)' : 'var(--border)'}`,
                }}
            >
                <span
                    className="flex-shrink-0 rounded-full mt-1.5"
                    style={{ width: 6, height: 6, background: isStored ? 'var(--accent)' : 'var(--pnl-green)' }}
                    aria-hidden="true"
                />
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {stored.kind === 'loading' && t('common.loadingEllipsis')}
                    {stored.kind === 'none' && t('about.serverDataNone')}
                    {stored.kind === 'stored' && t('about.serverDataStored', {
                        updated: date(stored.updatedAt),
                        expires: date(stored.expiresAt),
                    })}
                </p>
            </div>

            <p className="text-xs mt-4 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {t('about.serverDataIntro')}
            </p>

            {/* The row itself, column by column */}
            <div className="mt-3 rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                {COLUMNS.map((col, i) => (
                    <div
                        key={col.column}
                        className="px-4 py-3 sm:flex sm:gap-4"
                        style={i > 0 ? { borderTop: '1px solid var(--border)' } : undefined}
                    >
                        <code className="text-[11px] font-mono sm:w-32 sm:flex-shrink-0"
                            style={{ color: 'var(--accent)' }}>
                            {col.column}
                        </code>
                        <p className="text-xs mt-1 sm:mt-0 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                            {t(col.descKey)}
                        </p>
                    </div>
                ))}
            </div>

            <p className="text-xs mt-3 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                {t('about.serverDataRevoke')}
            </p>
        </section>
    );
}
