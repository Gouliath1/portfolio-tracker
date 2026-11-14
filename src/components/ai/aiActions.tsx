'use client';

/**
 * Page actions the assistant can propose, never perform.
 *
 * Each page registers what it can do in its own context (the screener can
 * refresh pinned stocks; the portfolio pages can refresh prices) using the same
 * function its own button calls. The assistant sees only an id and a
 * description. When it wants one it proposes it, the chat shows a confirm
 * button, and nothing runs until the user clicks it.
 *
 * That click is the safety property. Everything the model reads is untrusted
 * text, so an action must never be reachable from the model alone, however it
 * is worded, and the registry holds only reversible, bounded actions.
 */

import { createContext, useContext, useEffect, useId, useRef } from 'react';

export interface AiAction {
    /** Stable, lowercase id the model refers to, e.g. `refresh_pinned`. */
    id: string;
    /** What the user reads on the confirm button, translated and specific ("Refresh 12 pinned stocks"). */
    label: string;
    /** One translated sentence on what will happen. */
    detail?: string;
    /** For the model, English: when this action is appropriate. */
    description: string;
    /** Greyed out and not offered to the model, e.g. nothing to refresh. */
    disabled?: boolean;
    /**
     * Do it. Return `'started'` when the work carries on in the page after this
     * returns (a progress bar, say), so the card doesn't claim it finished.
     */
    run: () => Promise<void | 'started'> | void | 'started';
}

export interface AiActionRegistry {
    register: (owner: string, get: () => AiAction[]) => () => void;
    list: () => AiAction[];
    find: (id: string) => AiAction | undefined;
    /** Called after an action ran, so the assistant can reload the data it answers from. */
    ran: () => void;
}

export function createAiActionRegistry(onRan: () => void = () => {}): AiActionRegistry {
    const owners = new Map<string, () => AiAction[]>();
    const list = () => [...owners.values()].flatMap(get => get());
    return {
        register(owner, get) {
            owners.set(owner, get);
            return () => { owners.delete(owner); };
        },
        list,
        find: id => list().find(a => a.id === id),
        ran: onRan,
    };
}

export const AiActionRegistryContext = createContext<AiActionRegistry | null>(null);

/** Null outside the provider, so pages and tests without the assistant still work. */
export const useAiActionRegistry = () => useContext(AiActionRegistryContext);

/**
 * Offer these actions while the calling page is mounted. Pass a fresh array on
 * every render: the registry reads the latest one when it is asked, so labels
 * and counts stay current without re-registering.
 */
export function useAiActions(actions: AiAction[]): void {
    const registry = useAiActionRegistry();
    const owner = useId();
    const latest = useRef(actions);
    useEffect(() => { latest.current = actions; });
    useEffect(() => registry?.register(owner, () => latest.current), [registry, owner]);
}
