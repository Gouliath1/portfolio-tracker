/**
 * Client side of "Connect my AI".
 *
 * The portal is local-first: holdings live in this browser and the server never
 * sees them. Connecting an AI assistant is the one deliberate exception, so it
 * is opt-in, per-portfolio, and revocable — and the token that unlocks it is
 * generated here, in the browser, never by the server.
 *
 * The token is stored in localStorage alongside the portfolio it describes.
 * That matters for usability: reconnecting must not mint a new URL every time,
 * or the link the user pasted into Claude would silently stop working.
 */

import type { PortfolioSnapshot } from './portfolioSnapshot';

/** One token per portfolio set, so switching portfolios switches connections. */
const tokenKey = (setId: string) => `pt_ai_token_${setId}`;

/**
 * 256 bits from the platform CSPRNG, base64url-encoded to 43 characters.
 *
 * This is the only thing standing between a URL and someone's portfolio, so it
 * has to be unguessable rather than merely unique — `Math.random` and
 * timestamp-based ids are both disqualified.
 */
export function generateToken(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

export function readToken(setId: string): string | null {
    try {
        return localStorage.getItem(tokenKey(setId));
    } catch {
        return null;
    }
}

export function storeToken(setId: string, token: string): void {
    try {
        localStorage.setItem(tokenKey(setId), token);
    } catch {
        /* private mode — the connection simply won't survive a reload */
    }
}

export function clearToken(setId: string): void {
    try {
        localStorage.removeItem(tokenKey(setId));
    } catch {
        /* nothing to do */
    }
}

/** The URL the user pastes into their assistant's connector settings. */
export function connectorUrl(token: string): string {
    return `${window.location.origin}/api/mcp/${token}`;
}

export interface ShareStatus {
    active: boolean;
    updatedAt?: string;
    expiresAt?: string;
}

/**
 * Publish the snapshot under `token`, creating the share or refreshing it.
 *
 * Each publish also pushes the expiry out, so a portfolio someone actually
 * opens never lapses while an abandoned one ages out on its own.
 */
export async function publishShare(
    token: string,
    snapshot: PortfolioSnapshot,
    markdown: string,
): Promise<{ ok: true; expiresAt: string } | { ok: false; error: string }> {
    try {
        const response = await fetch('/api/share', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ token, snapshot, markdown }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            return { ok: false, error: data?.error ?? `Request failed (${response.status})` };
        }
        return { ok: true, expiresAt: data.expiresAt };
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'Network error' };
    }
}

/** Revoke the share. The link stops working immediately, everywhere. */
export async function revokeShare(token: string): Promise<boolean> {
    try {
        const response = await fetch('/api/share', {
            method: 'DELETE',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ token }),
        });
        return response.ok;
    } catch {
        return false;
    }
}

/** Ask the server whether a stored token is still live, e.g. after a reload. */
export async function fetchShareStatus(token: string): Promise<ShareStatus> {
    try {
        const response = await fetch(`/api/share?token=${encodeURIComponent(token)}`);
        if (!response.ok) return { active: false };
        const data = await response.json();
        return data.active
            ? { active: true, updatedAt: data.updatedAt, expiresAt: data.expiresAt }
            : { active: false };
    } catch {
        return { active: false };
    }
}
