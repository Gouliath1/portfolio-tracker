'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MdArrowUpward, MdStop, MdRestartAlt } from 'react-icons/md';
import { useTranslation } from '../../i18n';
import { useOptionalAccount } from '../account/AccountProvider';
import { useOptionalSync } from '../sync/SyncProvider';
import { RichText } from '../chat/RichText';
import type { PortfolioBrief } from './usePortfolioBrief';

/** Mirrors the server's cap so the box can't accept what the API will refuse. */
const MAX_QUESTION_CHARS = 800;

interface Turn {
    role: 'user' | 'assistant';
    content: string;
    /** A failure notice shown in place of an answer; never sent back as history. */
    error?: boolean;
}

type Availability = 'checking' | 'ready' | 'signin' | 'disabled';

/** The counter only appears once the allowance is nearly gone. */
const SHOW_LEFT_AT = 5;

interface AskTabProps {
    /** Brief plus structured snapshot, built on demand; null until the portfolio has loaded. */
    getBrief: () => PortfolioBrief | null;
    hasPositions: boolean;
    /** Whether this tab is the one on screen (it stays mounted so the conversation survives). */
    active: boolean;
    /** Closes the whole panel, e.g. before opening the sign-in dialog. */
    onClose: () => void;
}

export function AskTab({ getBrief, hasPositions, active, onClose }: AskTabProps) {
    const { t, language } = useTranslation();
    const [availability, setAvailability] = useState<Availability>('checking');
    const [turns, setTurns] = useState<Turn[]>([]);
    const [draft, setDraft] = useState('');
    const [busy, setBusy] = useState(false);
    const [remaining, setRemaining] = useState<number | null>(null);
    const account = useOptionalAccount();
    const sync = useOptionalSync();
    const signedInAs = account?.user?.email ?? null;

    const abortRef = useRef<AbortController | null>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Signing in or out changes what the server will allow, so ask again.
    useEffect(() => { setAvailability('checking'); }, [signedInAs]);

    // Ask the server whether chat is configured, who is signed in and what is left.
    useEffect(() => {
        if (!active || availability !== 'checking') return;
        let cancelled = false;
        fetch('/api/chat')
            .then(r => r.json())
            .then(d => {
                if (cancelled) return;
                setRemaining(typeof d?.remaining === 'number' ? d.remaining : null);
                setAvailability(!d?.enabled ? 'disabled' : d.signedIn ? 'ready' : 'signin');
            })
            .catch(() => { if (!cancelled) setAvailability('disabled'); });
        return () => { cancelled = true; };
    }, [active, availability]);

    useEffect(() => () => abortRef.current?.abort(), []);

    useEffect(() => {
        if (active && availability === 'ready') inputRef.current?.focus();
    }, [active, availability]);

    useEffect(() => {
        const el = listRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [turns, active]);

    const patchLast = (patch: (turn: Turn) => Turn) =>
        setTurns(prev => prev.length === 0 ? prev : [...prev.slice(0, -1), patch(prev[prev.length - 1])]);

    const ask = useCallback(async (raw: string) => {
        const question = raw.trim();
        const brief = getBrief();
        if (!question || busy || !hasPositions || !brief) return;

        // Failed notices are UI-only; replaying them would put our error text in Claude's mouth.
        const history = turns.filter(m => !m.error && m.content).map(({ role, content }) => ({ role, content }));
        const messages = [...history, { role: 'user' as const, content: question }];

        setTurns(prev => [...prev, { role: 'user', content: question }, { role: 'assistant', content: '' }]);
        setDraft('');
        setBusy(true);

        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ brief: brief.markdown, snapshot: brief.snapshot, messages, language }),
                signal: controller.signal,
            });
            if (!res.ok || !res.body) {
                if (res.status === 401) {
                    setAvailability('signin');
                    setTurns(prev => prev.slice(0, -2));
                    return;
                }
                const code = res.status === 429 ? (await res.json().catch(() => null))?.code : null;
                if (code === 'daily') setRemaining(0);
                patchLast(() => ({
                    role: 'assistant',
                    content: t(code === 'daily' ? 'chat.errDaily' : res.status === 429 ? 'chat.errRate' : 'chat.error'),
                    error: true,
                }));
                return;
            }
            setRemaining(r => (r === null ? r : Math.max(0, r - 1)));

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let received = '';
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                received += decoder.decode(value, { stream: true });
                const text = received;
                patchLast(turn => ({ ...turn, content: text }));
            }
            if (!received.trim()) {
                patchLast(() => ({ role: 'assistant', content: t('chat.empty'), error: true }));
            }
        } catch (error) {
            // A stop the user asked for keeps whatever arrived; anything else is a failure.
            if ((error as Error)?.name === 'AbortError') {
                patchLast(turn => turn.content ? turn : { role: 'assistant', content: t('chat.empty'), error: true });
            } else {
                patchLast(turn => ({
                    role: 'assistant',
                    content: turn.content ? `${turn.content}\n\n${t('chat.error')}` : t('chat.error'),
                    error: !turn.content,
                }));
            }
        } finally {
            abortRef.current = null;
            setBusy(false);
        }
    }, [busy, getBrief, hasPositions, language, t, turns]);

    const reset = () => {
        abortRef.current?.abort();
        setTurns([]);
        setDraft('');
        inputRef.current?.focus();
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void ask(draft);
        }
    };

    const suggestions = [t('chat.suggestion1'), t('chat.suggestion2')];

    return (
        <div className="flex flex-col flex-1 min-h-0">

                    <div ref={listRef} role="log" aria-live="polite"
                        className="flex-1 overflow-y-auto px-4 py-4 space-y-3 text-sm">
                        {turns.length === 0 && (
                            <div className="space-y-4">
                                <p style={{ color: 'var(--text-secondary)' }}>
                                    {availability === 'disabled' ? t('chat.disabled')
                                        : availability === 'signin' ? t('chat.signIn')
                                        : !hasPositions ? t('chat.noPositions')
                                        : t('chat.intro')}
                                </p>
                                {availability === 'signin' && sync && (
                                    <button
                                        onClick={() => { onClose(); sync.openPanel(); }}
                                        className="px-3 py-2 rounded-lg text-sm font-medium"
                                        style={{ background: 'var(--accent)', color: 'var(--surface)' }}>
                                        {t('chat.signInButton')}
                                    </button>
                                )}
                                {availability === 'ready' && hasPositions && (
                                    <div className="flex flex-col items-start gap-2">
                                        {suggestions.map(s => (
                                            <button key={s} onClick={() => void ask(s)}
                                                className="text-left px-3 py-2 rounded-lg text-sm transition-colors hover:opacity-80"
                                                style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                                                {s}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {turns.map((turn, i) => {
                            const last = i === turns.length - 1;
                            const streaming = busy && last;
                            if (turn.role === 'user') {
                                return (
                                    <div key={i} className="flex justify-end">
                                        <p className="whitespace-pre-wrap break-words max-w-[85%] px-3 py-2 rounded-lg leading-relaxed"
                                            style={{ background: 'var(--accent-dim)', color: 'var(--text-primary)' }}>
                                            {turn.content}
                                        </p>
                                    </div>
                                );
                            }
                            return (
                                <div key={i} className="min-w-0 px-3 py-2.5 rounded-lg"
                                    style={{
                                        background: 'var(--bg-base)',
                                        border: '1px solid var(--border)',
                                        color: turn.error ? 'var(--pnl-red)' : 'var(--text-primary)',
                                    }}>
                                    {turn.error || !turn.content
                                        ? <p className="leading-relaxed">{turn.content || (streaming ? '…' : '')}</p>
                                        : <RichText text={turn.content} streaming={streaming} />}
                                </div>
                            );
                        })}
                    </div>

                    <footer className="flex-shrink-0 px-3 pt-2 pb-3" style={{ borderTop: '1px solid var(--border)' }}>
                        <div className="flex items-end gap-2">
                            <textarea
                                ref={inputRef}
                                value={draft}
                                onChange={e => setDraft(e.target.value)}
                                onKeyDown={onKeyDown}
                                rows={1}
                                maxLength={MAX_QUESTION_CHARS}
                                disabled={availability !== 'ready' || !hasPositions}
                                placeholder={t('chat.placeholder')}
                                aria-label={t('chat.placeholder')}
                                className="flex-1 resize-none rounded-lg px-3 py-2 text-base md:text-sm max-h-28 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-[var(--accent)]"
                                style={{
                                    background: 'var(--bg-base)',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--border)',
                                }}
                            />
                            {busy ? (
                                <button onClick={() => abortRef.current?.abort()} aria-label={t('chat.stop')}
                                    className="h-9 w-9 flex items-center justify-center rounded-lg flex-shrink-0"
                                    style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                                    <MdStop size={18} />
                                </button>
                            ) : (
                                <button onClick={() => void ask(draft)} aria-label={t('chat.send')}
                                    disabled={!draft.trim() || availability !== 'ready' || !hasPositions}
                                    className="h-9 w-9 flex items-center justify-center rounded-lg flex-shrink-0 disabled:opacity-40"
                                    style={{ background: 'var(--accent)', color: 'var(--surface)' }}>
                                    <MdArrowUpward size={18} />
                                </button>
                            )}
                        </div>
                        <p className="mt-2 text-xs flex items-center justify-between gap-2" style={{ color: 'var(--text-muted)' }}>
                            <span>
                                {t('chat.privacy')}
                                {availability === 'ready' && remaining !== null && remaining <= SHOW_LEFT_AT && (
                                    <> {t('chat.left', { count: String(remaining) })}</>
                                )}
                            </span>
                            {turns.length > 0 && (
                                <button onClick={reset} aria-label={t('chat.clear')} title={t('chat.clear')}
                                    className="flex-shrink-0 flex items-center gap-1 hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>
                                    <MdRestartAlt size={14} />
                                    {t('chat.clear')}
                                </button>
                            )}
                        </p>
                    </footer>
        </div>
    );
}
