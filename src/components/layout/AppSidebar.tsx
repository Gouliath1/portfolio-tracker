'use client';

import { useRouter } from 'next/navigation';
import {
    MdHome, MdAccountBalance, MdSwapHoriz,
    MdTrendingUp, MdSettings, MdAccountBalanceWallet, MdManageSearch,
} from 'react-icons/md';

export type SidebarViewId = 'overview' | 'assets' | 'data';

interface AppSidebarProps {
    activePage: 'home' | 'deep-dive' | 'screener';
    /** Home page only — which main view is selected */
    activeView?: SidebarViewId;
    /** Home page only — called when a main nav item is clicked */
    onViewChange?: (id: SidebarViewId) => void;
    /** Home page only — opens the settings panel */
    onSettingsClick?: () => void;
    currency: string;
    /** Display name of the active portfolio, shown under the logo */
    activeSetName?: string;
}

const PortfoliosIcon = ({ size = 17 }: { size?: number }) => (
    <span className="inline-flex items-center" style={{ gap: 1 }}>
        <MdAccountBalanceWallet size={size} />
        <MdSwapHoriz size={Math.round(size * 0.75)} />
    </span>
);

const OVERVIEW_ITEM = { id: 'overview' as const, label: 'Overview', icon: MdHome };
const ASSETS_ITEM = { id: 'assets' as const, label: 'Assets', icon: MdAccountBalance };
// Data is last as a utility view.
const VIEW_ITEMS: { id: SidebarViewId; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
    { id: 'data', label: 'Portfolios', icon: PortfoliosIcon },
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
    activeSetName,
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

            {/* Active portfolio */}
            {activeSetName && (
                <div className="px-4 py-3 flex items-center gap-2.5 flex-shrink-0"
                    style={{ borderBottom: '1px solid var(--border)' }}>
                    <MdAccountBalanceWallet size={18} style={{ color: 'var(--accent)' }} className="flex-shrink-0" />
                    <div className="min-w-0">
                        <div className="text-[10px] font-semibold uppercase tracking-widest"
                            style={{ color: 'var(--text-muted)' }}>
                            Portfolio
                        </div>
                        <div className="text-sm font-medium truncate" title={activeSetName}
                            style={{ color: 'var(--text-primary)' }}>
                            {activeSetName}
                        </div>
                    </div>
                </div>
            )}

            {/* Nav — Overview · Analysis · Assets · Screener · Data */}
            <nav className="flex-1 px-3 py-4 space-y-0.5">
                {(() => {
                    const viewButton = ({ id, label, icon: Icon }: { id: SidebarViewId; label: string; icon: React.ComponentType<{ size?: number }> }) => {
                        const isActive = onHome && activeView === id;
                        return (
                            <button key={id}
                                onClick={() => {
                                    if (onHome && onViewChange) onViewChange(id);
                                    else router.push(`/?view=${id}`);
                                }}
                                className={itemClass}
                                style={isActive ? activeStyle : defaultStyle}>
                                <Icon size={17} />
                                {label}
                            </button>
                        );
                    };
                    return (
                        <>
                            {viewButton(OVERVIEW_ITEM)}

                            {/* Analysis (deep-dive) — sits right after Overview */}
                            {activePage === 'deep-dive' ? (
                                <div className={itemClass} style={activeStyle}>
                                    <MdTrendingUp size={17} />
                                    Analysis
                                </div>
                            ) : (
                                <button
                                    onClick={() => router.push('/returns/deep-dive')}
                                    className={itemClass}
                                    style={defaultStyle}>
                                    <MdTrendingUp size={17} />
                                    Analysis
                                </button>
                            )}

                            {viewButton(ASSETS_ITEM)}

                            {/* Screener — separate page for researching stocks before buying */}
                            {activePage === 'screener' ? (
                                <div className={itemClass} style={activeStyle}>
                                    <MdManageSearch size={17} />
                                    Screener
                                </div>
                            ) : (
                                <button
                                    onClick={() => router.push('/screener')}
                                    className={itemClass}
                                    style={defaultStyle}>
                                    <MdManageSearch size={17} />
                                    Screener
                                </button>
                            )}

                            {VIEW_ITEMS.map(viewButton)}
                        </>
                    );
                })()}
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
