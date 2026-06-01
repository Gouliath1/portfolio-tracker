'use client';

import { useRouter } from 'next/navigation';
import {
    MdHome, MdAccountBalance, MdHistory, MdTune,
    MdTrendingUp, MdSettings,
} from 'react-icons/md';

export type SidebarViewId = 'overview' | 'holdings' | 'closed' | 'transactions';

interface AppSidebarProps {
    activePage: 'home' | 'deep-dive';
    /** Home page only — which main view is selected */
    activeView?: SidebarViewId;
    /** Home page only — called when a main nav item is clicked */
    onViewChange?: (id: SidebarViewId) => void;
    /** Home page only — opens the settings panel */
    onSettingsClick?: () => void;
    currency: string;
}

const NAV_ITEMS: { id: SidebarViewId; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
    { id: 'overview',      label: 'Overview',  icon: MdHome },
    { id: 'holdings',      label: 'Holdings',  icon: MdAccountBalance },
    { id: 'closed',        label: 'Closed',    icon: MdHistory },
    { id: 'transactions',  label: 'Manage',    icon: MdTune },
];

const activeStyle  = { background: 'var(--accent-dim)', color: 'var(--accent)' } as const;
const defaultStyle = { color: 'var(--text-secondary)' } as const;
const itemClass    = 'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-left transition-colors hover:opacity-80';

export function AppSidebar({
    activePage,
    activeView,
    onViewChange,
    onSettingsClick,
    currency,
}: AppSidebarProps) {
    const onHome = activePage === 'home';
    const router = useRouter();

    return (
        <aside
            className="hidden md:flex flex-col fixed inset-y-0 left-0 z-20"
            style={{ width: '200px', background: 'var(--surface-sidebar)', borderRight: '1px solid var(--border)' }}
        >
            {/* Logo */}
            <div className="px-5 h-[52px] flex items-center flex-shrink-0"
                style={{ borderBottom: '1px solid var(--border)' }}>
                <button
                    onClick={() => router.push('/')}
                    className="text-[15px] font-semibold tracking-tight text-left"
                    style={{ color: 'var(--text-primary)' }}>
                    Portfolio<span style={{ color: 'var(--accent)' }}>Tracker</span>
                </button>
            </div>

            {/* Nav */}
            <nav className="flex-1 px-3 py-4 space-y-0.5">
                {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
                    const isActive = onHome && activeView === id;
                    return (
                        <button key={id}
                            onClick={() => {
                                if (onHome && onViewChange) {
                                    onViewChange(id);
                                } else {
                                    router.push(`/?view=${id}`);
                                }
                            }}
                            className={itemClass}
                            style={isActive ? activeStyle : defaultStyle}>
                            <Icon size={17} />
                            {label}
                        </button>
                    );
                })}

                {/* Analysis sub-section */}
                <div className="pt-4 pb-1 px-3">
                    <span className="text-[10px] font-semibold uppercase tracking-widest"
                        style={{ color: 'var(--text-muted)', opacity: 0.55 }}>
                        Analysis
                    </span>
                </div>

                {activePage === 'deep-dive' ? (
                    <div className={itemClass} style={activeStyle}>
                        <MdTrendingUp size={17} />
                        XIRR Deep Dive
                    </div>
                ) : (
                    <button
                        onClick={() => router.push('/returns/deep-dive')}
                        className={itemClass}
                        style={defaultStyle}>
                        <MdTrendingUp size={17} />
                        XIRR Deep Dive
                    </button>
                )}
            </nav>

            {/* Footer */}
            <div className="px-3 pb-5 pt-3 space-y-0.5" style={{ borderTop: '1px solid var(--border)' }}>
                <div className="px-3 py-2 flex items-center gap-2">
                    <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded"
                        style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                        {currency}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>base currency</span>
                </div>
                {onHome && onSettingsClick ? (
                    <button
                        onClick={onSettingsClick}
                        className={itemClass}
                        style={defaultStyle}
                        aria-label="Open settings">
                        <MdSettings size={17} />
                        Settings
                    </button>
                ) : (
                    <button
                        onClick={() => router.push('/')}
                        className={itemClass}
                        style={defaultStyle}>
                        <MdSettings size={17} />
                        Settings
                    </button>
                )}
            </div>
        </aside>
    );
}
