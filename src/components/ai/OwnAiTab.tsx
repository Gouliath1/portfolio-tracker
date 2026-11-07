'use client';

/**
 * "Use my own AI" — taking the portfolio to an assistant outside this app.
 *
 * Two ways, and the page is organised around the one question that tells them
 * apart: where does the data go?
 *
 *  - Copy a summary: onto the clipboard, nowhere else.
 *  - Connect Claude: stored on the server under a secret link, until the user
 *    disconnects. The one place holdings leave the browser, so the state is
 *    either clearly off or clearly on, the consequence is stated before the
 *    user commits, and disconnecting is a single visible click.
 *
 * The connection is per-portfolio: switching portfolios switches tokens, so
 * connecting one never exposes another.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
    MdAutoAwesome, MdContentCopy, MdCheck, MdLinkOff, MdRefresh, MdOpenInNew,
} from 'react-icons/md';
import { useTranslation } from '../../i18n';
import { copyToClipboard } from '../../utils/clipboard';
import {
    generateToken, readToken, storeToken, clearToken, connectorUrl,
    publishShare, revokeShare, fetchShareStatus,
} from '../../utils/aiConnection';
import type { PortfolioBrief } from './usePortfolioBrief';

interface OwnAiTabProps {
    active: boolean;
    /** Identifies which portfolio this connection belongs to. */
    setId: string | null;
    getBrief: () => PortfolioBrief | null;
    /** False while the portfolio is still being computed; avoids a false "no positions" hint. */
    loaded: boolean;
    hasPositions: boolean;
    /** Tells the launcher whether a live connection exists. */
    onConnectedChange: (connected: boolean) => void;
}

type State =
    | { kind: 'idle' }
    | { kind: 'working' }
    | { kind: 'connected'; url: string; expiresAt?: string }
    | { kind: 'error'; message: string };

const COPIED_MS = 2500;

export function OwnAiTab({ active, setId, getBrief, loaded, hasPositions, onConnectedChange }: OwnAiTabProps) {
    const { t, locale } = useTranslation();
    const [state, setState] = useState<State>({ kind: 'idle' });
    const [copied, setCopied] = useState<'summary' | 'link' | 'failed' | null>(null);
    const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const refreshed = useRef(false);

    useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current); }, []);

    const flash = (what: 'summary' | 'link' | 'failed') => {
        setCopied(what);
        if (copiedTimer.current) clearTimeout(copiedTimer.current);
        copiedTimer.current = setTimeout(() => setCopied(null), COPIED_MS);
    };

    useEffect(() => { onConnectedChange(state.kind === 'connected'); }, [state.kind, onConnectedChange]);

    // Reflect the server's view when the tab is shown: a share may have been
    // revoked from another device, or expired while this browser still holds the token.
    useEffect(() => {
        if (!active || !setId) return;
        refreshed.current = false;
        const token = readToken(setId);
        if (!token) {
            setState({ kind: 'idle' });
            return;
        }
        let cancelled = false;
        void fetchShareStatus(token).then(status => {
            if (cancelled) return;
            setState(status.active
                ? { kind: 'connected', url: connectorUrl(token), expiresAt: status.expiresAt }
                : { kind: 'idle' });
        });
        return () => { cancelled = true; };
    }, [active, setId]);

    const publish = useCallback(async () => {
        if (!setId) return;
        const brief = getBrief();
        if (!brief) return;
        setState(prev => (prev.kind === 'connected' ? prev : { kind: 'working' }));

        // Reuse an existing token so reconnecting doesn't invalidate a link the
        // user has already pasted into their assistant.
        const token = readToken(setId) ?? generateToken();
        const result = await publishShare(token, brief.snapshot, brief.markdown);
        if (!result.ok) {
            setState({ kind: 'error', message: result.error });
            return;
        }
        storeToken(setId, token);
        setState({ kind: 'connected', url: connectorUrl(token), expiresAt: result.expiresAt });
    }, [setId, getBrief]);

    // An existing connection is brought up to date once each time the tab is
    // opened, which is also what pushes its expiry out, as the explainer promises.
    useEffect(() => {
        if (!active || state.kind !== 'connected' || refreshed.current || !getBrief()) return;
        refreshed.current = true;
        void publish();
    }, [active, state.kind, getBrief, publish]);

    const disconnect = useCallback(async () => {
        if (!setId) return;
        const token = readToken(setId);
        setState({ kind: 'working' });
        if (token) await revokeShare(token);
        clearToken(setId);
        setState({ kind: 'idle' });
    }, [setId]);

    const copySummary = useCallback(async () => {
        const brief = getBrief();
        flash(brief && await copyToClipboard(brief.markdown) ? 'summary' : 'failed');
    }, [getBrief]);

    const copyUrl = useCallback(async () => {
        if (state.kind === 'connected') flash(await copyToClipboard(state.url) ? 'link' : 'failed');
    }, [state]);

    const card = 'rounded-xl p-4 space-y-3';
    const cardStyle = { background: 'var(--bg-base)', border: '1px solid var(--border)' };
    const muted = { color: 'var(--text-secondary)' };

    return (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 text-sm">
            <section className={card} style={cardStyle}>
                <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t('ai.copyTitle')}</h3>
                <p className="text-xs leading-relaxed" style={muted}>{t('ai.copyBody')}</p>
                <button
                    onClick={copySummary}
                    disabled={!hasPositions}
                    className="h-9 w-full flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                    style={{ color: 'var(--text-primary)', border: '1px solid var(--border-strong)' }}
                >
                    {copied === 'summary' ? <MdCheck size={16} /> : <MdContentCopy size={16} />}
                    {copied === 'summary' ? t('ai.copied') : t('ai.copyButton')}
                </button>
                {!loaded && (
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('common.loadingEllipsis')}</p>
                )}
                {copied === 'failed' && (
                    <p role="alert" className="text-xs" style={{ color: 'var(--pnl-red)' }}>{t('ai.copyError')}</p>
                )}
            </section>

            <section className={card} style={cardStyle}>
                <h3 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                    {t('ai.connectTitle')}
                    {state.kind === 'connected' && (
                        <span className="text-xs font-medium px-1.5 py-0.5 rounded"
                            style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                            {t('ai.connectedBadge')}
                        </span>
                    )}
                </h3>
                <p className="text-xs leading-relaxed" style={muted}>{t('ai.explainer')}</p>

                {state.kind === 'connected' ? (
                    <div className="space-y-3">
                        <div className="rounded-xl p-3 space-y-2"
                            style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-glow)' }}>
                            <div className="text-xs font-medium" style={{ color: 'var(--accent)' }}>
                                {t('ai.connected')}
                            </div>
                            <div className="flex items-stretch gap-2">
                                <code className="flex-1 min-w-0 text-xs px-2 py-1.5 rounded-lg break-all"
                                    style={{ background: 'var(--surface-popover)', color: 'var(--text-secondary)' }}>
                                    {state.url}
                                </code>
                                <button onClick={copyUrl} aria-label={t('ai.copyLink')}
                                    className="flex-shrink-0 px-3 rounded-lg text-xs font-medium transition-all"
                                    style={{ background: 'var(--accent)', color: 'var(--bg-base)' }}>
                                    {copied === 'link' ? <MdCheck size={16} /> : <MdContentCopy size={16} />}
                                </button>
                            </div>
                            {state.expiresAt && (
                                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                    {t('ai.expires', { date: new Date(state.expiresAt).toLocaleDateString(locale) })}
                                </div>
                            )}
                        </div>

                        <ol className="text-xs space-y-1 pl-4 list-decimal" style={muted}>
                            <li>{t('ai.step1')}</li>
                            <li>{t('ai.step2')}</li>
                            <li>{t('ai.step3')}</li>
                        </ol>

                        <div className="flex items-center gap-2">
                            <button onClick={publish}
                                className="h-8 flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium transition-all"
                                style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                                <MdRefresh size={14} />
                                {t('ai.updateNow')}
                            </button>
                            <button onClick={disconnect}
                                className="h-8 flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium transition-all"
                                style={{ color: 'var(--pnl-red)', border: '1px solid var(--border)' }}>
                                <MdLinkOff size={14} />
                                {t('ai.disconnect')}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <button onClick={publish}
                            disabled={state.kind === 'working' || !hasPositions || !setId}
                            className="h-9 w-full flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                            style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-glow)' }}>
                            <MdAutoAwesome size={16} />
                            {state.kind === 'working' ? t('ai.connecting') : t('ai.connect')}
                        </button>
                        {!loaded ? (
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('common.loadingEllipsis')}</p>
                        ) : !hasPositions && (
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('ai.needPositions')}</p>
                        )}
                        {state.kind === 'error' && (
                            <p role="alert" className="text-xs" style={{ color: 'var(--pnl-red)' }}>{state.message}</p>
                        )}
                    </div>
                )}

                <details className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    <summary className="cursor-pointer select-none" style={muted}>{t('ai.howItWorksTitle')}</summary>
                    <div className="pt-2 space-y-2 leading-relaxed">
                        <p>{t('ai.howItWorks1')}</p>
                        <p>{t('ai.howItWorks2')}</p>
                        <p>{t('ai.howItWorks3')}</p>
                        <a href="https://support.anthropic.com/en/articles/11175166" target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1" style={{ color: 'var(--accent)' }}>
                            {t('ai.learnMore')} <MdOpenInNew size={12} />
                        </a>
                    </div>
                </details>
            </section>
        </div>
    );
}
