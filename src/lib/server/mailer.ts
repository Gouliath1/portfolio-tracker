/**
 * Transactional email for sign-in links, via Resend's HTTP API (no SDK).
 *
 * Configure RESEND_API_KEY and AUTH_FROM_EMAIL (an address on a domain verified
 * in Resend). Without a key, non-production environments print the link to the
 * server log instead of sending, so sign-in can be developed and tested
 * locally; production without a key refuses rather than silently dropping mail.
 */

export type MailResult =
    | { ok: true; devLink?: string }
    | { ok: false; reason: 'not-configured' | 'send-failed' };

export async function sendLoginEmail(to: string, link: string): Promise<MailResult> {
    const key = process.env.RESEND_API_KEY;
    const from = process.env.AUTH_FROM_EMAIL;

    if (!key || !from) {
        if (process.env.NODE_ENV === 'production') return { ok: false, reason: 'not-configured' };
        console.info(`[auth] Sign-in link for ${to} (email not configured, not sent): ${link}`);
        return { ok: true, devLink: link };
    }

    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
            body: JSON.stringify({
                from,
                to,
                subject: 'Your Portfolio Tracker sign-in link',
                text:
                    `Use this link to sign in. It works once and expires in 15 minutes:\n\n${link}\n\n` +
                    `If you didn't ask for it, you can ignore this email — nothing happens unless the link is opened.`,
                html:
                    `<p>Use this link to sign in. It works once and expires in 15 minutes.</p>` +
                    `<p><a href="${link}">Sign in to Portfolio Tracker</a></p>` +
                    `<p style="color:#666">If you didn't ask for it, you can ignore this email — nothing happens unless the link is opened.</p>`,
            }),
        });
        if (!res.ok) {
            console.warn(`[auth] Resend rejected the email: HTTP ${res.status}`);
            return { ok: false, reason: 'send-failed' };
        }
        return { ok: true };
    } catch (error) {
        console.warn('[auth] Email send failed:', error instanceof Error ? error.message : error);
        return { ok: false, reason: 'send-failed' };
    }
}
