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
import { useEffect } from 'react';
import { MdClose } from 'react-icons/md';
import { useSync } from './SyncProvider';
import { SyncSection } from './SyncSection';
import { collectSyncBlob, summarizeBlob, type BlobSummary } from '../../utils/syncState';

function Dialog({ title, body, extra, children }: { title: string; body: string; extra?: ReactNode; children: ReactNode }) {
    return (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center sm:p-4"
            style={{ background: 'rgba(0,0,0,0.5)' }} role="dialog" aria-modal="true" aria-label={title}>
            <div className="glass w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 space-y-4"
                style={{ background: 'var(--surface-popover)', border: '1px solid var(--border)' }}>
                <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h2>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{body}</p>
                {extra}
                <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">{children}</div>
            </div>
        </div>
    );
}

const primary = { background: 'var(--accent)', color: 'var(--bg-base)' } as const;
const secondary = { color: 'var(--text-secondary)', border: '1px solid var(--border)' } as const;
function CopyCard({ label, summary }: { label: string; summary: BlobSummary | null }) {
    const { t } = useTranslation();
    const empty = !summary || (summary.workspaces.length === 0 && summary.transactions === 0);
    return (
        <div className="rounded-lg p-3 text-sm" style={{ background: 'var(--glass-bg)', border: '1px solid var(--border)' }}>
            <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>{label}</div>
            {empty ? (
                <div style={{ color: 'var(--text-secondary)' }}>{t('sync.summaryEmpty')}</div>
            ) : (
                <div style={{ color: 'var(--text-primary)' }}>
                    {summary!.workspaces.join(', ') || '—'}
                    <span style={{ color: 'var(--text-secondary)' }}>
                        {' · '}{t('sync.summaryTx', { count: summary!.transactions })}
                    </span>
                </div>
            )}
        </div>
    );
}

const btn = 'h-9 px-4 rounded-lg text-sm font-medium transition-all';

function SyncPanel({ onClose }: { onClose: () => void }) {
    const { t } = useTranslation();
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', h);
        return () => document.removeEventListener('keydown', h);
    }, [onClose]);
    return (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4"
            style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}
            role="dialog" aria-modal="true" aria-label={t('sync.sectionTitle')}>
            <div className="w-full sm:max-w-md max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-5"
                style={{ background: 'var(--surface-popover)', border: '1px solid var(--border)' }}
                onClick={e => e.stopPropagation()}>
                <button onClick={onClose} aria-label={t('sync.closePanel')}
                    className="float-right p-1.5 rounded-lg" style={{ color: 'var(--text-muted)' }}>
                    <MdClose size={18} />
                </button>
                <SyncSection />
            </div>
        </div>
    );
}

export function SyncDialogs() {
    const { t } = useTranslation();
    const {
        conflict, pendingJoin, remoteUpdate, join, resolveConflict, dismissPendingJoin, applyRemoteUpdate,
        panelOpen, closePanel,
    } = useSync();

    if (conflict) {
        return (
            <Dialog title={t('sync.conflictTitle')} body={t('sync.conflictBody')} extra={
                <div className="space-y-2">
                    <CopyCard label={t('sync.thisDevice')} summary={summarizeBlob(collectSyncBlob())} />
                    <CopyCard label={t('sync.cloud')} summary={summarizeBlob(conflict.server.blob)} />
                </div>
            }>
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

    if (panelOpen) return <SyncPanel onClose={closePanel} />;

    if (remoteUpdate) {
        // Non-blocking: applying the update reloads the page, so the user picks the moment.
        return (
            <div className="fixed bottom-20 sm:bottom-4 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm"
                role="status"
                style={{ background: 'var(--surface-popover)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                <span>{t('sync.remoteUpdate')}</span>
                <button className="h-8 px-3 rounded-lg text-xs font-medium" style={primary}
                    onClick={() => void applyRemoteUpdate()}>
                    {t('sync.reload')}
                </button>
            </div>
        );
    }

    return null;
}
