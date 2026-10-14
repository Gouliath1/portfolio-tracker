'use client';

/**
 * Landing page for the emailed sign-in link. The token is in the URL fragment
 * (never sent to the server or logged), and this page's own script posts it —
 * so mail scanners that merely GET the link can't use it up.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from '../../../i18n';

type State = 'working' | 'done' | 'error';

export default function VerifyPage() {
    const { t } = useTranslation();
    const [state, setState] = useState<State>('working');
    const [message, setMessage] = useState<string | null>(null);
    // The link is single-use and the effect strips it from the URL, so it must run
    // exactly once — React's dev-mode double effect would otherwise redeem it and
    // then report "invalid" on the second pass.
    const started = useRef(false);

    useEffect(() => {
        if (started.current) return;
        started.current = true;
        const token = /[#&]t=([A-Za-z0-9_-]{32,128})/.exec(window.location.hash)?.[1];
        // Drop the token from the address bar and history straight away.
        window.history.replaceState(null, '', window.location.pathname);
        if (!token) { setState('error'); setMessage(t('account.verifyInvalid')); return; }

        void (async () => {
            try {
                const res = await fetch('/api/auth/verify', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ token }),
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok && data.ok) {
                    setState('done');
                    window.location.replace('/');
                } else {
                    setState('error');
                    setMessage(data.error ?? t('account.verifyInvalid'));
                }
            } catch {
                setState('error');
                setMessage(t('account.verifyInvalid'));
            }
        })();
    }, [t]);

    return (
        <main className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg-base)' }}>
            <div className="w-full max-w-sm rounded-2xl p-6 space-y-3"
                style={{ background: 'var(--surface-popover)', border: '1px solid var(--border)' }}>
                <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {state === 'error' ? t('account.verifyFailedTitle') : t('account.verifyingTitle')}
                </h1>
                <p className="text-sm" style={{ color: state === 'error' ? 'var(--pnl-red)' : 'var(--text-secondary)' }}>
                    {state === 'error' ? message : t('account.verifying')}
                </p>
                {state === 'error' && (
                    <Link href="/" className="inline-block text-sm font-medium" style={{ color: 'var(--accent)' }}>
                        {t('account.backToApp')}
                    </Link>
                )}
            </div>
        </main>
    );
}
