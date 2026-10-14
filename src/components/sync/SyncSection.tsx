'use client';

/**
 * The sync panel body. One goal — "my portfolio on my other devices" — with one
 * primary action per state:
 *
 *   signed out        → email me a sign-in link   (the key-based path is folded away)
 *   signed in, off    → upload & turn on sync
 *   synced            → status, and quiet maintenance actions
 *
 * Both ways of syncing (an account, or a private link/key) live here so the
 * user decides once, in one place. What turning sync on does is stated as plain
 * text next to the button instead of behind a second confirmation click.
 */

import { useState, type ReactNode } from 'react';
import { MdCheck, MdContentCopy, MdExpandMore } from 'react-icons/md';
import { useTranslation } from '../../i18n';
import { copyToClipboard } from '../../utils/clipboard';
import { readJoinTokenFromHash } from '../../utils/syncClient';
import { hasBackup, restoreBackup, summarizeBlob, collectSyncBlob } from '../../utils/syncState';
import { useOptionalSync, type SyncContextValue } from './SyncProvider';
import { useOptionalAccount, type AccountContextValue } from '../account/AccountProvider';

function extractToken(input: string): string | null {
    const trimmed = input.trim();
    if (/^[A-Za-z0-9_-]{32,128}$/.test(trimmed)) return trimmed;
    const hashIdx = trimmed.indexOf('#');
    return hashIdx >= 0 ? readJoinTokenFromHash(trimmed.slice(hashIdx)) : null;
}

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]';

const PrimaryButton = ({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...rest}
        className={`h-9 px-4 rounded-lg text-sm font-medium transition-opacity disabled:opacity-50 ${FOCUS}`}
        style={{ background: 'var(--accent)', color: 'var(--bg-base)' }}>
        {children}
    </button>
);

/** Secondary actions are text, not boxes: they're maintenance, not the point of the panel. */
const TextButton = ({ children, danger, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) => (
    <button {...rest}
        className={`text-xs font-medium underline-offset-4 hover:underline disabled:opacity-50 rounded ${FOCUS}`}
        style={{ color: danger ? 'var(--pnl-red)' : 'var(--text-secondary)' }}>
        {children}
    </button>
);

const inputStyle = { background: 'var(--surface-popover)', color: 'var(--text-primary)', border: '1px solid var(--border)' } as const;
const inputClass = `h-9 px-3 rounded-lg text-sm min-w-0 flex-1 ${FOCUS}`;

export const SyncSection = () => {
    const sync = useOptionalSync();
    const account = useOptionalAccount();
    return sync ? <SyncPanelBody sync={sync} account={account} /> : null;
};

const SyncPanelBody = ({ sync, account }: { sync: SyncContextValue; account: AccountContextValue | null }) => {
    const { t, locale } = useTranslation();
    const { status, enabled, error, lastSyncedAt, link, mode, switchToAccount, enable, join, disable, syncNow } = sync;
    const user = account?.user ?? null;
    const working = status === 'syncing';

    const [email, setEmail] = useState('');
    const [sentTo, setSentTo] = useState<string | null>(null);
    const [devLink, setDevLink] = useState<string | null>(null);
    const [accountBusy, setAccountBusy] = useState(false);
    const [accountError, setAccountError] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [joinInput, setJoinInput] = useState('');
    const [joinError, setJoinError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [backupAvailable, setBackupAvailable] = useState(() => typeof window !== 'undefined' && hasBackup());

    const sendLink = async () => {
        if (!account || !email.trim() || accountBusy) return;
        setAccountBusy(true);
        setAccountError(null);
        const res = await account.requestLink(email.trim());
        setAccountBusy(false);
        if (res.ok) { setSentTo(email.trim()); setDevLink(res.devLink ?? null); }
        else setAccountError(res.error);
    };

    const removeAccount = async () => {
        if (!account) return;
        setAccountBusy(true);
        const ok = await account.deleteAccount();
        setAccountBusy(false);
        setConfirmDelete(false);
        if (!ok) setAccountError(t('account.deleteFailed'));
    };

    const submitJoin = () => {
        const token = extractToken(joinInput);
        if (!token) { setJoinError(t('sync.errBadKey')); return; }
        setJoinError(null);
        setJoinInput('');
        void join(token);
    };

    const copyLink = async () => {
        if (link && await copyToClipboard(link)) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        }
    };

    const downloadRecovery = () => {
        if (!link) return;
        const blob = new Blob([JSON.stringify({ app: 'portfolio-tracker', syncLink: link }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'portfolio-sync-recovery.json';
        a.click();
        URL.revokeObjectURL(url);
    };

    const restore = () => { if (restoreBackup()) window.location.reload(); else setBackupAvailable(false); };

    const statusText = status === 'syncing' ? t('sync.syncing')
        : status === 'conflict' ? t('sync.statusConflict')
        : lastSyncedAt ? t('sync.lastSynced', { time: lastSyncedAt.toLocaleTimeString(locale) })
        : t('sync.statusOn');

    /** What "turn on" does, in plain words, shown beside the button rather than behind a second click. */
    const uploadNote = (() => {
        const sum = summarizeBlob(collectSyncBlob());
        return `${t('sync.confirmContents', { workspaces: sum?.workspaces.length ?? 0, count: sum?.transactions ?? 0 })} ${user ? t('sync.confirmBodyAccount') : t('sync.confirmBody')}`;
    })();

    const Muted = ({ children }: { children: ReactNode }) => (
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{children}</p>
    );

    // ── The key/link path: no account needed. Folded away unless it's what you have. ──
    const keyPath = (
        <details className="group">
            <summary className={`cursor-pointer select-none text-xs font-medium list-none rounded inline-flex items-center gap-1 ${FOCUS}`}
                style={{ color: 'var(--text-secondary)' }}>
                <span className="underline-offset-4 group-hover:underline">{t('sync.useLinkInstead')}</span>
                <MdExpandMore size={16} className="transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="pt-3 space-y-4">
                <div className="space-y-2">
                    <Muted>{t('sync.keyPathCreate')}</Muted>
                    <button onClick={() => void enable()} disabled={working}
                        className={`h-9 px-4 rounded-lg text-sm font-medium disabled:opacity-50 ${FOCUS}`}
                        style={{ color: 'var(--accent)', border: '1px solid var(--accent-glow)', background: 'var(--accent-dim)' }}>
                        {t('sync.createLink')}
                    </button>
                </div>
                <div className="space-y-2">
                    <label htmlFor="sync-join" className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {t('sync.joinLabel')}
                    </label>
                    <div className="flex gap-2">
                        <input id="sync-join" value={joinInput} onChange={e => setJoinInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') submitJoin(); }}
                            placeholder={t('sync.joinPlaceholder')} autoComplete="off" spellCheck={false}
                            className={inputClass} style={inputStyle} />
                        <TextButton onClick={submitJoin} disabled={!joinInput.trim() || working}>{t('sync.join')}</TextButton>
                    </div>
                    {joinError && <p className="text-xs" style={{ color: 'var(--pnl-red)' }}>{joinError}</p>}
                </div>
            </div>
        </details>
    );

    // ── Body, by state ──
    let body: ReactNode;

    if (enabled && mode === 'account') {
        body = (
            <>
                <p className="text-sm font-medium flex items-center gap-1.5" style={{ color: 'var(--accent)' }}>
                    <MdCheck size={16} />{statusText}
                </p>
                <Muted>{t('sync.accountOn')}</Muted>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                    <TextButton onClick={() => void syncNow()} disabled={working}>{t('sync.checkUpdates')}</TextButton>
                    <TextButton onClick={() => void disable()} danger>{t('sync.disable')}</TextButton>
                </div>
            </>
        );
    } else if (enabled && link) {
        body = (
            <>
                <p className="text-sm font-medium flex items-center gap-1.5" style={{ color: 'var(--accent)' }}>
                    <MdCheck size={16} />{statusText}
                </p>
                <div className="space-y-2">
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('sync.alreadyOn')}</p>
                    <div className="flex items-stretch gap-2">
                        <code className="flex-1 min-w-0 text-xs px-3 py-2 rounded-lg break-all"
                            style={{ background: 'var(--surface-popover)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                            {link}
                        </code>
                        <button onClick={copyLink} aria-label={t('sync.copyLink')}
                            className={`flex-shrink-0 w-9 rounded-lg flex items-center justify-center ${FOCUS}`}
                            style={{ background: 'var(--accent)', color: 'var(--bg-base)' }}>
                            {copied ? <MdCheck size={16} /> : <MdContentCopy size={16} />}
                        </button>
                    </div>
                    <Muted>{t('sync.linkWarning')}</Muted>
                </div>
                {user && (
                    <div className="space-y-2">
                        <Muted>{t('sync.switchHint')}</Muted>
                        <PrimaryButton onClick={() => void switchToAccount()} disabled={working}>{t('sync.switchToAccount')}</PrimaryButton>
                    </div>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                    <TextButton onClick={() => void syncNow()} disabled={working}>{t('sync.checkUpdates')}</TextButton>
                    <TextButton onClick={downloadRecovery}>{t('sync.recoveryFile')}</TextButton>
                    <TextButton onClick={() => void disable()} danger>{t('sync.disable')}</TextButton>
                </div>
            </>
        );
    } else if (user) {
        body = (
            <>
                <Muted>{uploadNote}</Muted>
                <PrimaryButton onClick={() => void enable()} disabled={working}>
                    {working ? t('sync.enabling') : t('sync.enableAccount')}
                </PrimaryButton>
                {keyPath}
            </>
        );
    } else if (account) {
        body = (
            <>
                {sentTo ? (
                    devLink ? (
                        // Email isn't configured (local development): nothing was sent, so don't
                        // talk about an inbox — offer the link itself.
                        <div className="space-y-2">
                            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('account.devTitle')}</p>
                            <Muted>{t('account.devBody')}</Muted>
                            <a href={devLink}
                                className={`inline-flex items-center h-9 px-4 rounded-lg text-sm font-medium ${FOCUS}`}
                                style={{ background: 'var(--accent)', color: 'var(--bg-base)' }}>
                                {t('account.devOpen')}
                            </a>
                            <div><TextButton onClick={() => { setSentTo(null); setDevLink(null); }}>{t('account.useAnotherEmail')}</TextButton></div>
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('account.checkInbox')}</p>
                            <Muted>{t('account.linkSentTo', { email: sentTo })}</Muted>
                            <TextButton onClick={() => { setSentTo(null); setDevLink(null); }}>{t('account.useAnotherEmail')}</TextButton>
                        </div>
                    )
                ) : (
                    <div className="space-y-2">
                        <div className="flex gap-2">
                            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') void sendLink(); }}
                                placeholder={t('account.emailPlaceholder')} autoComplete="email"
                                aria-label={t('account.emailPlaceholder')} className={inputClass} style={inputStyle} />
                            <PrimaryButton onClick={() => void sendLink()} disabled={!email.trim() || accountBusy}>
                                {accountBusy ? t('account.sending') : t('account.sendLink')}
                            </PrimaryButton>
                        </div>
                        <Muted>{t('account.explainer')}</Muted>
                    </div>
                )}
                {keyPath}
            </>
        );
    } else {
        // No account system available (e.g. isolated render): the key path is the only path.
        body = (
            <>
                <Muted>{uploadNote}</Muted>
                <PrimaryButton onClick={() => void enable()} disabled={working}>{working ? t('sync.enabling') : t('sync.enable')}</PrimaryButton>
            </>
        );
    }

    return (
        <section className="space-y-4">
            <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{t('sync.sectionTitle')}</h2>

            {!enabled && <Muted>{t('sync.explainer')}</Muted>}

            {user && (
                <p className="text-xs flex flex-wrap items-center gap-x-2" style={{ color: 'var(--text-secondary)' }}>
                    <span>{t('account.signedInAs')} <strong style={{ color: 'var(--text-primary)' }} className="break-all">{user.email}</strong></span>
                    <TextButton onClick={() => void account?.signOut()}>{t('account.signOut')}</TextButton>
                </p>
            )}

            {body}

            {(error || accountError) && (
                <p className="text-xs" style={{ color: 'var(--pnl-red)' }}>{error ?? accountError}</p>
            )}

            {backupAvailable && (
                <div className="space-y-1">
                    <TextButton onClick={restore}>{t('sync.restoreBackup')}</TextButton>
                    <Muted>{t('sync.restoreBackupHint')}</Muted>
                </div>
            )}

            {user && (
                confirmDelete ? (
                    <div className="space-y-2 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                        <p className="text-xs" style={{ color: 'var(--text-primary)' }}>{t('account.deleteConfirm')}</p>
                        <div className="flex gap-4">
                            <TextButton onClick={() => setConfirmDelete(false)} disabled={accountBusy}>{t('sync.cancel')}</TextButton>
                            <TextButton onClick={() => void removeAccount()} disabled={accountBusy} danger>{t('account.deleteNow')}</TextButton>
                        </div>
                    </div>
                ) : (
                    <div className="pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                        <TextButton onClick={() => setConfirmDelete(true)} danger>{t('account.delete')}</TextButton>
                    </div>
                )
            )}
        </section>
    );
};
