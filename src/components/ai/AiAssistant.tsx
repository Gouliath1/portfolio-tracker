'use client';

/**
 * The single entry point to everything AI in the app, on every page.
 *
 * One launcher, one panel, two tabs:
 *  - Ask here: the built-in chat.
 *  - Use my own AI: copy a summary, or connect Claude.
 *
 * Mounted once in the root layout, so it survives navigation (the conversation
 * isn't lost when moving between pages) and reads the portfolio itself rather
 * than borrowing a page's state. Nothing loads until the panel is first opened.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { MdAutoAwesome, MdClose, MdOpenInFull, MdCloseFullscreen } from 'react-icons/md';
import { useTranslation } from '../../i18n';
import { getActiveSetId } from '../../utils/localPositions';
import { readToken, fetchShareStatus } from '../../utils/aiConnection';
import { AskTab } from './AskTab';
import { OwnAiTab } from './OwnAiTab';
import { usePortfolioBrief } from './usePortfolioBrief';

export type AiTab = 'ask' | 'own';

interface AiAssistantApi {
    open: (tab?: AiTab) => void;
}

const AiAssistantContext = createContext<AiAssistantApi | null>(null);

/** Null outside the provider, so components and tests that don't need AI still render. */
export const useOptionalAiAssistant = () => useContext(AiAssistantContext);

/** Pages where an assistant would only be in the way (sign-in links, etc.). */
const HIDDEN_ON = ['/auth'];

export function AiAssistant({ children }: { children: React.ReactNode }) {
    const { t } = useTranslation();
    const pathname = usePathname();
    const [open, setOpen] = useState(false);
    const [tab, setTab] = useState<AiTab>('ask');
    /** Desktop only: a roomier panel for tables and charts. */
    const [wide, setWide] = useState(false);
    const [connected, setConnected] = useState(false);
    // Bumped on every open so the panel re-reads a portfolio that may have changed.
    const [openCount, setOpenCount] = useState(0);
    const launcherRef = useRef<HTMLButtonElement>(null);
    const everOpened = openCount > 0;

    const { getBrief, setId, loaded, hasPositions } = usePortfolioBrief(everOpened, openCount);

    const show = useCallback((next?: AiTab) => {
        if (next) setTab(next);
        setOpenCount(n => n + 1);
        setOpen(true);
    }, []);

    const close = useCallback(() => {
        setOpen(false);
        launcherRef.current?.focus();
    }, []);

    const api = useMemo<AiAssistantApi>(() => ({ open: show }), [show]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, close]);

    // The launcher shows whether a live connection exists, before the panel has
    // ever been opened. Only the stored token is read here; the server says if it's still good.
    useEffect(() => {
        if (open) return;
        let cancelled = false;
        try {
            const token = readToken(getActiveSetId());
            if (!token) { setConnected(false); return; }
            void fetchShareStatus(token).then(s => { if (!cancelled) setConnected(s.active); });
        } catch {
            setConnected(false);
        }
        return () => { cancelled = true; };
    }, [open]);

    const hidden = HIDDEN_ON.some(p => pathname?.startsWith(p));

    const tabs: { id: AiTab; label: string }[] = [
        { id: 'ask', label: t('ai.tabAsk') },
        { id: 'own', label: t('ai.tabOwn') },
    ];

    return (
        <AiAssistantContext.Provider value={api}>
            {children}

            {!hidden && !open && (
                <button
                    ref={launcherRef}
                    onClick={() => show()}
                    aria-label={t('ai.open')}
                    className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:right-6 md:bottom-6 z-40 flex items-center gap-2 h-11 px-3.5 rounded-full text-sm font-medium transition-colors hover:opacity-90"
                    style={{
                        background: 'var(--surface-popover)',
                        color: 'var(--accent)',
                        border: '1px solid var(--border-strong)',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
                    }}
                >
                    <span className="relative flex">
                        <MdAutoAwesome size={18} aria-hidden="true" />
                        {connected && (
                            <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full"
                                style={{ background: 'var(--pnl-green, var(--accent))', border: '1.5px solid var(--surface-popover)' }}
                                title={t('ai.connectedBadge')} />
                        )}
                    </span>
                    <span className="hidden sm:inline">{t('ai.launch')}</span>
                </button>
            )}

            {!hidden && everOpened && (
                <section
                    role="dialog"
                    aria-label={t('ai.title')}
                    hidden={!open}
                    className={`fixed z-50 flex-col inset-x-0 top-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] md:inset-x-auto md:top-auto md:right-6 md:bottom-6 md:rounded-xl overflow-hidden ${open ? 'flex' : 'hidden'} ${wide
                        ? 'md:w-[min(780px,calc(100vw-3rem))] md:h-[calc(100dvh-3rem)]'
                        : 'md:w-[480px] md:h-[min(700px,calc(100dvh-3rem))]'}`}
                    style={{
                        background: 'var(--surface-popover)',
                        border: '1px solid var(--border-strong)',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                    }}
                >
                    <header className="flex items-center justify-between gap-2 pl-4 pr-2 h-12 flex-shrink-0"
                        style={{ borderBottom: '1px solid var(--border)' }}>
                        <h2 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                            {t('ai.title')}
                        </h2>
                        <div className="flex items-center">
                            <button onClick={() => setWide(w => !w)} aria-pressed={wide}
                                aria-label={t(wide ? 'chat.collapse' : 'chat.expand')} title={t(wide ? 'chat.collapse' : 'chat.expand')}
                                className="hidden md:flex p-2 rounded-lg hover:opacity-80" style={{ color: 'var(--text-muted)' }}>
                                {wide ? <MdCloseFullscreen size={16} /> : <MdOpenInFull size={16} />}
                            </button>
                            <button onClick={close} aria-label={t('ai.close')}
                                className="p-2 rounded-lg hover:opacity-80" style={{ color: 'var(--text-muted)' }}>
                                <MdClose size={18} />
                            </button>
                        </div>
                    </header>

                    <div role="tablist" aria-label={t('ai.title')} className="flex gap-1 px-3 pt-2 flex-shrink-0"
                        style={{ borderBottom: '1px solid var(--border)' }}>
                        {tabs.map(({ id, label }) => {
                            const selected = tab === id;
                            return (
                                <button key={id} role="tab" id={`ai-tab-${id}`} aria-selected={selected} aria-controls={`ai-panel-${id}`}
                                    onClick={() => setTab(id)}
                                    className="px-3 py-2 text-sm font-medium -mb-px flex items-center gap-1.5"
                                    style={{
                                        color: selected ? 'var(--accent)' : 'var(--text-muted)',
                                        borderBottom: `2px solid ${selected ? 'var(--accent)' : 'transparent'}`,
                                    }}>
                                    {label}
                                    {id === 'own' && connected && (
                                        <span className="w-1.5 h-1.5 rounded-full" aria-label={t('ai.connectedBadge')}
                                            style={{ background: 'var(--pnl-green, var(--accent))' }} />
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Both tabs stay mounted so a conversation survives a trip to the other tab. */}
                    <div role="tabpanel" id="ai-panel-ask" aria-labelledby="ai-tab-ask"
                        className={tab === 'ask' ? 'flex flex-col flex-1 min-h-0' : 'hidden'}>
                        <AskTab
                            getBrief={getBrief}
                            // Optimistic until the portfolio has loaded, so the "add positions" hint doesn't flash.
                            hasPositions={!loaded || hasPositions}
                            active={open && tab === 'ask'}
                            onClose={close}
                        />
                    </div>
                    <div role="tabpanel" id="ai-panel-own" aria-labelledby="ai-tab-own"
                        className={tab === 'own' ? 'flex flex-col flex-1 min-h-0' : 'hidden'}>
                        <OwnAiTab
                            active={open && tab === 'own'}
                            setId={setId}
                            getBrief={getBrief}
                            loaded={loaded}
                            hasPositions={hasPositions}
                            onConnectedChange={setConnected}
                        />
                    </div>
                </section>
            )}
        </AiAssistantContext.Provider>
    );
}
