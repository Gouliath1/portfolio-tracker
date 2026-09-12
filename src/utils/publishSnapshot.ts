/**
 * Publishes the portfolio snapshot to the local snapshot bridge, so an MCP
 * server (and through it, an AI assistant) can read holdings that otherwise
 * never leave this browser.
 *
 * **The localhost gate is a privacy boundary, not an optimisation.** The
 * portal is local-first: on a hosted deployment, positions stay in the
 * visitor's own localStorage and the server never sees them. POSTing a
 * snapshot from a hosted page would quietly break that promise and upload the
 * visitor's holdings to whoever runs the deployment. So the publish only fires
 * when the page is served from this machine, where "the server" and "the user"
 * are the same person and the file lands on their own disk.
 *
 * Failures are swallowed on purpose. The bridge is a convenience: if the route
 * is missing, the disk is full, or the app is running somewhere without a
 * writable filesystem, the portal must carry on working exactly as before.
 */

import type { PortfolioSnapshot } from './portfolioSnapshot';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** Whether this page is being served from the machine it's running on. */
export function isLocalHost(): boolean {
    if (typeof window === 'undefined') return false;
    return LOCAL_HOSTNAMES.has(window.location.hostname);
}

export async function publishSnapshot(
    snapshot: PortfolioSnapshot,
    markdown: string,
): Promise<boolean> {
    if (!isLocalHost()) return false;

    try {
        const response = await fetch('/api/snapshot', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ snapshot, markdown }),
        });
        return response.ok;
    } catch {
        return false;
    }
}
