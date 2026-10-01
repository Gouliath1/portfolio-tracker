'use client';

/**
 * The two moments sync needs a human decision:
 *  - a `#sync=` link was opened (join this session?)
 *  - this device and the cloud both changed (which copy wins?)
 *
 * No auto-merge in v1: either choice replaces one side wholesale, so the
 * wording says exactly what gets overwritten.
 */

import type { ReactNode } from 'react';
import { useTranslation } from '../../i18n';
import { useSync } from './SyncProvider';

function Dialog({ title, body, children }: { title: string; body: string; children: ReactNode }) {
    return (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center sm:p-4"
            style={{ background: 'rgba(0,0,0,0.5)' }} role="dialog" aria-modal="true" aria-label={title}>
            <div className="glass w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 space-y-4"
                style={{ background: 'var(--surface-popover)', border: '1px solid var(--border)' }}>
                <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h2>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{body}</p>
                <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">{children}</div>
            </div>
        </div>
    );
}

const primary = { background: 'var(--accent)', color: 'var(--bg-base)' } as const;
const secondary = { color: 'var(--text-secondary)', border: '1px solid var(--border)' } as const;
const btn = 'h-9 px-4 rounded-lg text-sm font-medium transition-all';

export function SyncDialogs() {
    const { t } = useTranslation();
    const { conflict, pendingJoin, join, resolveConflict, dismissPendingJoin } = useSync();

    if (conflict) {
        return (
            <Dialog title={t('sync.conflictTitle')} body={t('sync.conflictBody')}>
                <button className={btn} style={secondary} onClick={() => void resolveConflict('local')}>
                    {t('sync.keepThisDevice')}
                </button>
                <button className={btn} style={primary} onClick={() => void resolveConflict('cloud')}>
                    {t('sync.keepCloud')}
                </button>
            </Dialog>
        );
    }

    if (pendingJoin) {
        return (
            <Dialog title={t('sync.joinTitle')} body={t('sync.joinBody')}>
                <button className={btn} style={secondary} onClick={dismissPendingJoin}>
                    {t('sync.cancel')}
                </button>
                <button className={btn} style={primary} onClick={() => void join(pendingJoin)}>
                    {t('sync.join')}
                </button>
            </Dialog>
        );
    }

    return null;
}
