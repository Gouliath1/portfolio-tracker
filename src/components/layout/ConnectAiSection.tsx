'use client';

/**
 * "Connect my AI" — the opt-in that lets an assistant read this portfolio.
 *
 * Everywhere else in the app, holdings stay in this browser. This is the one
 * place they leave it, so the UI is built to make that legible rather than
 * incidental: the state is either clearly off or clearly on, the consequence
 * is stated in plain words before the user commits, and disconnecting is a
 * single visible click rather than something buried.
 *
 * The connection is per-portfolio. Switching portfolios switches tokens, so
 * connecting one never exposes another.
 */

import { useCallback, useEffect, useState } from 'react';
import {
    MdAutoAwesome, MdContentCopy, MdCheck, MdLinkOff, MdRefresh, MdOpenInNew,
} from 'react-icons/md';
import { useTranslation } from '../../i18n';
import { copyToClipboard } from '../../utils/clipboard';
import {
    generateToken, readToken, storeToken, clearToken, connectorUrl,
    publishShare, revokeShare, fetchShareStatus,
} from '../../utils/aiConnection';
import type { PortfolioSnapshot } from '../../utils/portfolioSnapshot';

interface ConnectAiSectionProps {
    open: boolean;
    /** Identifies which portfolio this connection belongs to. */
    setId: string | null;
    /** Built on demand so an unopened panel never serialises the portfolio. */
    buildBrief: () => { snapshot: PortfolioSnapshot; markdown: string };
    hasPositions: boolean;
}

type State =
    | { kind: 'idle' }
    | { kind: 'working' }
    | { kind: 'connected'; url: string; expiresAt?: string }
    | { kind: 'error'; message: string };

export const ConnectAiSection = ({ open, setId, buildBrief, hasPositions }: ConnectAiSectionProps) => {
    const { t, locale } = useTranslation();
    const [state, setState] = useState<State>({ kind: 'idle' });
    const [copied, setCopied] = useState(false);

    // Reflect the server's view on open: a share may have been revoked from
    // another device, or expired while this browser still holds the token.
    useEffect(() => {
        if (!open || !setId) return;
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
    }, [open, setId]);

    const connect = useCallback(async () => {
        if (!setId) return;
        setState({ kind: 'working' });

        // Reuse an existing token so reconnecting doesn't invalidate a link the
        // user has already pasted into their assistant.
        const token = readToken(setId) ?? generateToken();
        const { snapshot, markdown } = buildBrief();
        const result = await publishShare(token, snapshot, markdown);

        if (!result.ok) {
            setState({ kind: 'error', message: result.error });
            return;
        }
        storeToken(setId, token);
        setState({ kind: 'connected', url: connectorUrl(token), expiresAt: result.expiresAt });
    }, [setId, buildBrief]);

    const disconnect = useCallback(async () => {
        if (!setId) return;
        const token = readToken(setId);
        setState({ kind: 'working' });
        if (token) await revokeShare(token);
        clearToken(setId);
        setState({ kind: 'idle' });
    }, [setId]);

    const copyUrl = useCallback(async () => {
        if (state.kind !== 'connected') return;
        if (await copyToClipboard(state.url)) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        }
    }, [state]);

    const heading = (
        <h3 className="text-xs font-semibold uppercase tracking-widest flex items-center gap-2"
            style={{ color: 'var(--text-muted)' }}>
            <MdAutoAwesome size={14} />
            {t('ai.sectionTitle')}
        </h3>
    );

    return (
        <section className="space-y-3">
            {heading}

            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {t('ai.explainer')}
            </p>

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
                            <button
                                onClick={copyUrl}
                                className="flex-shrink-0 px-3 rounded-lg text-xs font-medium transition-all"
                                style={{ background: 'var(--accent)', color: 'var(--bg-base)' }}
                                aria-label={t('ai.copyLink')}
                            >
                                {copied ? <MdCheck size={16} /> : <MdContentCopy size={16} />}
                            </button>
                        </div>
                        {state.expiresAt && (
                            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                {t('ai.expires', {
                                    date: new Date(state.expiresAt).toLocaleDateString(locale),
                                })}
                            </div>
                        )}
                    </div>

                    <ol className="text-xs space-y-1 pl-4 list-decimal" style={{ color: 'var(--text-secondary)' }}>
                        <li>{t('ai.step1')}</li>
                        <li>{t('ai.step2')}</li>
                        <li>{t('ai.step3')}</li>
                    </ol>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={connect}
                            className="h-8 flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium transition-all"
                            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                        >
                            <MdRefresh size={14} />
                            {t('ai.updateNow')}
                        </button>
                        <button
                            onClick={disconnect}
                            className="h-8 flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium transition-all"
                            style={{ color: 'var(--pnl-red)', border: '1px solid var(--border)' }}
                        >
                            <MdLinkOff size={14} />
                            {t('ai.disconnect')}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="space-y-2">
                    <button
                        onClick={connect}
                        disabled={state.kind === 'working' || !hasPositions || !setId}
                        className="h-9 w-full flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                        style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-glow)' }}
                    >
                        <MdAutoAwesome size={16} />
                        {state.kind === 'working' ? t('ai.connecting') : t('ai.connect')}
                    </button>
                    {!hasPositions && (
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            {t('ai.needPositions')}
                        </p>
                    )}
                    {state.kind === 'error' && (
                        <p className="text-xs" style={{ color: 'var(--pnl-red)' }}>
                            {state.message}
                        </p>
                    )}
                </div>
            )}

            <details className="text-xs" style={{ color: 'var(--text-muted)' }}>
                <summary className="cursor-pointer select-none" style={{ color: 'var(--text-secondary)' }}>
                    {t('ai.howItWorksTitle')}
                </summary>
                <div className="pt-2 space-y-2 leading-relaxed">
                    <p>{t('ai.howItWorks1')}</p>
                    <p>{t('ai.howItWorks2')}</p>
                    <p>{t('ai.howItWorks3')}</p>
                    <a
                        href="https://support.anthropic.com/en/articles/11175166"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1"
                        style={{ color: 'var(--accent)' }}
                    >
                        {t('ai.learnMore')} <MdOpenInNew size={12} />
                    </a>
                </div>
            </details>
        </section>
    );
};
