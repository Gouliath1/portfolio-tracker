'use client';

/**
 * Who is signed in, app-wide. Sign-in is optional: the app works signed out,
 * and anonymous key-based sync keeps working. An account adds sync that can't
 * be lost with a key.
 *
 * The session itself lives in an HttpOnly cookie the page can't read, so this
 * only mirrors what `/api/auth/me` reports.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export interface AccountUser { email: string }

export type RequestLinkResult =
    | { ok: true; devLink?: string }
    | { ok: false; error: string };

export interface AccountContextValue {
    user: AccountUser | null;
    /** False until the first `/api/auth/me` answer, so the UI doesn't flash "signed out". */
    loaded: boolean;
    requestLink: (email: string) => Promise<RequestLinkResult>;
    signOut: () => Promise<void>;
    deleteAccount: () => Promise<boolean>;
}

const AccountContext = createContext<AccountContextValue | null>(null);

/** Null outside a provider, so components rendered in isolation can omit account UI. */
export const useOptionalAccount = (): AccountContextValue | null => useContext(AccountContext);

export function useAccount(): AccountContextValue {
    const ctx = useOptionalAccount();
    if (!ctx) throw new Error('useAccount must be used inside <AccountProvider>');
    return ctx;
}

export function AccountProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<AccountUser | null>(null);
    const [loaded, setLoaded] = useState(false);

    const refresh = useCallback(async () => {
        try {
            const res = await fetch('/api/auth/me', { cache: 'no-store' });
            const data = res.ok ? await res.json() as { user: AccountUser | null } : { user: null };
            setUser(data.user);
        } catch {
            setUser(null);
        } finally {
            setLoaded(true);
        }
    }, []);

    useEffect(() => { void refresh(); }, [refresh]);

    const requestLink = useCallback(async (email: string): Promise<RequestLinkResult> => {
        try {
            const res = await fetch('/api/auth/request', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.ok) return { ok: true, ...(data.devLink ? { devLink: data.devLink as string } : {}) };
            return { ok: false, error: data.error ?? `HTTP ${res.status}` };
        } catch (e) {
            return { ok: false, error: e instanceof Error ? e.message : 'Network error' };
        }
    }, []);

    const signOut = useCallback(async () => {
        try { await fetch('/api/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); }
        finally { setUser(null); }
    }, []);

    const deleteAccount = useCallback(async () => {
        try {
            const res = await fetch('/api/auth/account', { method: 'DELETE' });
            if (res.ok) { setUser(null); return true; }
        } catch { /* fall through */ }
        return false;
    }, []);

    const value = useMemo<AccountContextValue>(
        () => ({ user, loaded, requestLink, signOut, deleteAccount }),
        [user, loaded, requestLink, signOut, deleteAccount],
    );
    return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}
