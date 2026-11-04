'use client';

/**
 * Who is signed in, as a quiet mark: an initial in a small circle, optionally
 * with the name. Renders nothing when signed out, so it can sit anywhere
 * (sidebar, mobile header) without a conditional at each call site.
 */

import { useTranslation } from '../../i18n';
import { useOptionalAccount, displayName, initialOf } from './AccountProvider';

export function OwnerBadge({ showName = false, className = '' }: { showName?: boolean; className?: string }) {
    const account = useOptionalAccount();
    const { t } = useTranslation();
    const user = account?.user;
    if (!user) return null;
    const name = displayName(user);
    return (
        <span className={`inline-flex items-center gap-1.5 min-w-0 ${className}`}
            title={t('account.ownerTitle', { name, email: user.email })}>
            <span aria-hidden className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-semibold leading-none"
                style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-glow)' }}>
                {initialOf(user)}
            </span>
            {showName
                ? <span className="truncate">{name}</span>
                : <span className="sr-only">{t('account.ownerTitle', { name, email: user.email })}</span>}
        </span>
    );
}
