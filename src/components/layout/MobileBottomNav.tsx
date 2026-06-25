'use client';

import { useRouter } from 'next/navigation';
import {
    MdHome, MdAccountBalance, MdTune,
    MdTrendingUp, MdSettings, MdManageSearch,
} from 'react-icons/md';

export type MobileNavPage = 'home' | 'deep-dive' | 'screener';
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
                <MdHome size={20} /><span>Overview</span>
            </button>
            <button
                onClick={() => activePage === 'deep-dive' ? handleCurrentPage() : router.push('/returns/deep-dive')}
                className={BTN}
                style={c(noSettings && activePage === 'deep-dive')}
            >
                <MdTrendingUp size={20} /><span>Analysis</span>
            </button>
            <button
                onClick={() => activePage === 'screener' ? handleCurrentPage() : router.push('/screener')}
                className={BTN}
                style={c(noSettings && activePage === 'screener')}
            >
                <MdManageSearch size={20} /><span>Screener</span>
            </button>
            <button
                onClick={() => goHomeView('assets')}
                className={BTN}
                style={c(noSettings && activePage === 'home' && activeView === 'assets')}
            >
                <MdAccountBalance size={20} /><span>Assets</span>
            </button>
            <button
                onClick={() => goHomeView('data')}
                className={BTN}
                style={c(noSettings && activePage === 'home' && activeView === 'data')}
            >
                <MdTune size={20} /><span>Data</span>
            </button>
            <button
                onClick={onSettingsToggle}
                aria-label="Settings"
                className={BTN}
                style={{ ...c(settingsOpen), borderLeft: '1px solid var(--border)' }}
            >
                <MdSettings size={20} /><span>Settings</span>
            </button>
        </nav>
    );
}
