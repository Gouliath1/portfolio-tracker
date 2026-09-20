'use client';

import { useRouter } from 'next/navigation';
import {
    MdHome, MdAccountBalance, MdSwapHoriz, MdAccountBalanceWallet,
    MdTrendingUp, MdSettings, MdManageSearch,
} from 'react-icons/md';
import { useTranslation } from '../../i18n';

export type MobileNavPage = 'home' | 'deep-dive' | 'screener' | 'taxes' | 'about';
export type HomeView = 'overview' | 'assets' | 'data';

interface MobileBottomNavProps {
    activePage: MobileNavPage;
    /** Home page only — which sub-view is active */
    activeView?: HomeView;
    /** Home page only — called on tab tap; should also close settings */
    onViewChange?: (v: HomeView) => void;
    settingsOpen?: boolean;
    onSettingsToggle?: () => void;
}

const BTN = 'flex-1 flex flex-col items-center gap-1 py-2 text-xs font-medium transition-colors';

export function MobileBottomNav({
    activePage,
    activeView,
    onViewChange,
    settingsOpen = false,
    onSettingsToggle,
}: MobileBottomNavProps) {
    const router = useRouter();
    const { t } = useTranslation();

    const c = (active: boolean) => ({ color: active ? 'var(--accent)' : 'var(--text-muted)' });
    const noSettings = !settingsOpen;

    const goHomeView = (view: HomeView) => {
        if (onViewChange) onViewChange(view);
        else router.push(`/?view=${view}`);
    };

    // When already on this page, tapping the tab just closes the settings drawer.
    const handleCurrentPage = () => {
        if (settingsOpen) onSettingsToggle?.();
    };

    return (
        <nav
            className="md:hidden fixed bottom-0 inset-x-0 z-[60] flex"
            style={{
                background: 'var(--surface-sidebar)',
                borderTop: '1px solid var(--border)',
                paddingBottom: 'env(safe-area-inset-bottom)',
            }}
        >
            <button
                onClick={() => goHomeView('overview')}
                className={BTN}
                style={c(noSettings && activePage === 'home' && activeView === 'overview')}
            >
                <MdHome size={20} /><span>{t('nav.overview')}</span>
            </button>
            <button
                onClick={() => activePage === 'deep-dive' ? handleCurrentPage() : router.push('/returns/deep-dive')}
                className={BTN}
                style={c(noSettings && activePage === 'deep-dive')}
            >
                <MdTrendingUp size={20} /><span>{t('nav.analysis')}</span>
            </button>
            <button
                onClick={() => goHomeView('assets')}
                className={BTN}
                style={c(noSettings && activePage === 'home' && activeView === 'assets')}
            >
                <MdAccountBalance size={20} /><span>{t('nav.assets')}</span>
            </button>
            <button
                onClick={() => activePage === 'screener' ? handleCurrentPage() : router.push('/screener')}
                className={BTN}
                style={c(noSettings && activePage === 'screener')}
            >
                <MdManageSearch size={20} /><span>{t('nav.screener')}</span>
            </button>
            <button
                onClick={() => goHomeView('data')}
                className={BTN}
                style={c(noSettings && activePage === 'home' && activeView === 'data')}
            >
                <span className="inline-flex items-center" style={{ gap: 1 }}>
                    <MdAccountBalanceWallet size={20} />
                    <MdSwapHoriz size={15} />
                </span><span>{t('nav.portfolios')}</span>
            </button>
            <button
                onClick={onSettingsToggle}
                aria-label={t('nav.settings')}
                className={BTN}
                style={{ ...c(settingsOpen), borderLeft: '1px solid var(--border)' }}
            >
                <MdSettings size={20} /><span>{t('nav.settings')}</span>
            </button>
        </nav>
    );
}
