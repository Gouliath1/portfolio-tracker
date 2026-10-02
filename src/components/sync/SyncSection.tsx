'use client';

/**
 * Settings section for cross-device sync — the second opt-in (after "Connect
 * my AI") that lets holdings leave this browser. Same legibility rules: the
 * state is plainly on or off, the consequence is stated before committing,
 * and turning it off is one visible click.
 */

import { useState } from 'react';
import { MdSync, MdContentCopy, MdCheck, MdSyncDisabled, MdDownload } from 'react-icons/md';
import { useTranslation } from '../../i18n';
import { copyToClipboard } from '../../utils/clipboard';
import { readJoinTokenFromHash } from '../../utils/syncClient';
import { hasBackup, restoreBackup, summarizeBlob, collectSyncBlob } from '../../utils/syncState';
import { useOptionalSync, type SyncContextValue } from './SyncProvider';

function extractToken(input: string): string | null {
    const trimmed = input.trim();
    if (/^[A-Za-z0-9_-]{32,128}$/.test(trimmed)) return trimmed;
    const hashIdx = trimmed.indexOf('#');
    return hashIdx >= 0 ? readJoinTokenFromHash(trimmed.slice(hashIdx)) : null;
}

export const SyncSection = () => {
    const sync = useOptionalSync();
    return sync ? <SyncSectionInner sync={sync} /> : null;
};

const SyncSectionInner = ({ sync }: { sync: SyncContextValue }) => {
    const { t, locale } = useTranslation();
    const { status, enabled, error, lastSyncedAt, link, enable, join, disable, syncNow } = sync;
    const [copied, setCopied] = useState(false);
    const [joinInput, setJoinInput] = useState('');
    const [joinError, setJoinError] = useState<string | null>(null);
    const working = status === 'syncing';
    const [confirming, setConfirming] = useState(false);
    const [backupAvailable, setBackupAvailable] = useState(() => typeof window !== 'undefined' && hasBackup());
    const restore = () => {
        if (restoreBackup()) window.location.reload();
        else setBackupAvailable(false);
    };

    const copyLink = async () => {
        if (link && await copyToClipboard(link)) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        }
    };

    const downloadRecovery = () => {
        if (!link) return;
        const blob = new Blob([JSON.stringify({ app: 'portfolio-tracker', syncLink: link }, null, 2)],
            { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'portfolio-sync-recovery.json';
        a.click();
        URL.revokeObjectURL(url);
    };

    const submitJoin = () => {
        const token = extractToken(joinInput);
        if (!token) {
            setJoinError(t('sync.errBadKey'));
            return;
        }
        setJoinError(null);
        setJoinInput('');
        void join(token);
    };

    const statusText = status === 'syncing' ? t('sync.syncing')
        : status === 'conflict' ? t('sync.statusConflict')
        : lastSyncedAt ? t('sync.lastSynced', { time: lastSyncedAt.toLocaleTimeString(locale) })
        : t('sync.statusOn');

    return (
        <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest flex items-center gap-2"
                style={{ color: 'var(--text-muted)' }}>
                <MdSync size={14} />
                {t('sync.sectionTitle')}
            </h3>

            {!enabled && (
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {t('sync.explainer')}
                </p>
            )}

            {enabled && link ? (
                <div className="space-y-3">
                    <div className="rounded-xl p-3 space-y-2"
                        style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-glow)' }}>
                        <div className="text-xs font-medium flex items-center gap-1.5" style={{ color: 'var(--accent)' }}>
                            <MdCheck size={14} />{statusText}
                        </div>
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('sync.alreadyOn')}</p>
                        <div className="flex items-stretch gap-2">
                            <code className="flex-1 min-w-0 text-xs px-2 py-1.5 rounded-lg break-all"
                                style={{ background: 'var(--surface-popover)', color: 'var(--text-secondary)' }}>
                                {link}
                            </code>
                            <button onClick={copyLink} aria-label={t('sync.copyLink')}
                                className="flex-shrink-0 px-3 rounded-lg text-xs font-medium transition-all"
                                style={{ background: 'var(--accent)', color: 'var(--bg-base)' }}>
                                {copied ? <MdCheck size={16} /> : <MdContentCopy size={16} />}
                            </button>
                        </div>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('sync.linkWarning')}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <button onClick={() => void syncNow()} disabled={working}
                            className="h-8 flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
                            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                            <MdSync size={14} />
                            {t('sync.checkUpdates')}
                        </button>
                        <button onClick={downloadRecovery}
                            className="h-8 flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium transition-all"
                            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                            <MdDownload size={14} />
                            {t('sync.recoveryFile')}
                        </button>
                        <button onClick={() => void disable()}
                            className="h-8 flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium transition-all"
                            style={{ color: 'var(--pnl-red)', border: '1px solid var(--border)' }}>
                            <MdSyncDisabled size={14} />
                            {t('sync.disable')}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="space-y-3">
                    {confirming ? (
                        <div className="rounded-xl p-3 space-y-2"
                            style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-glow)' }}>
                            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                                {t('sync.confirmTitle')}
                            </p>
                            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                {(() => {
                                    const sum = summarizeBlob(collectSyncBlob());
                                    return t('sync.confirmContents', {
                                        workspaces: sum?.workspaces.length ?? 0,
                                        count: sum?.transactions ?? 0,
                                    });
                                })()}
                            </p>
                            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('sync.confirmBody')}</p>
                            <div className="flex gap-2">
                                <button onClick={() => setConfirming(false)}
                                    className="h-8 px-3 rounded-lg text-xs font-medium"
                                    style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                                    {t('sync.cancel')}
                                </button>
                                <button onClick={() => { setConfirming(false); void enable(); }} disabled={working}
                                    className="h-8 px-3 rounded-lg text-xs font-medium disabled:opacity-50"
                                    style={{ background: 'var(--accent)', color: 'var(--bg-base)' }}>
                                    {t('sync.confirmUpload')}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button onClick={() => setConfirming(true)} disabled={working}
                            className="h-9 w-full flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                            style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-glow)' }}>
                            <MdSync size={16} />
                            {working ? t('sync.enabling') : t('sync.enable')}
                        </button>
                    )}

                    <div className="space-y-1.5">
                        <label className="text-xs" style={{ color: 'var(--text-secondary)' }} htmlFor="sync-join">
                            {t('sync.joinLabel')}
                        </label>
                        <div className="flex gap-2">
                            <input id="sync-join" value={joinInput}
                                onChange={e => setJoinInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') submitJoin(); }}
                                placeholder={t('sync.joinPlaceholder')}
                                autoComplete="off" spellCheck={false}
                                className="flex-1 min-w-0 h-8 px-2 rounded-lg text-xs"
                                style={{ background: 'var(--surface-popover)', color: 'var(--text-primary)', border: '1px solid var(--border)' }} />
                            <button onClick={submitJoin} disabled={!joinInput.trim() || working}
                                className="h-8 px-3 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
                                style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                                {t('sync.join')}
                            </button>
                        </div>
                        {joinError && <p className="text-xs" style={{ color: 'var(--pnl-red)' }}>{joinError}</p>}
                    </div>
                </div>
            )}

            {backupAvailable && (
                <div className="space-y-1">
                    <button onClick={restore}
                        className="h-8 px-3 rounded-lg text-xs font-medium transition-all"
                        style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                        {t('sync.restoreBackup')}
                    </button>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('sync.restoreBackupHint')}</p>
                </div>
            )}

            {error && <p className="text-xs" style={{ color: 'var(--pnl-red)' }}>{error}</p>}

            <details className="text-xs" style={{ color: 'var(--text-muted)' }}>
                <summary className="cursor-pointer select-none" style={{ color: 'var(--text-secondary)' }}>
                    {t('sync.howItWorksTitle')}
                </summary>
                <div className="pt-2 space-y-2 leading-relaxed">
                    <p>{t('sync.howItWorks1')}</p>
                    <p>{t('sync.howItWorks2')}</p>
                    <p>{t('sync.howItWorks3')}</p>
                </div>
            </details>
        </section>
    );
};
