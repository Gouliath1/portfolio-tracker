'use client';

import { useRouter } from 'next/navigation';
import {
    MdHome, MdAccountBalance, MdSwapHoriz, MdInfoOutline,
    MdTrendingUp, MdSettings, MdAccountBalanceWallet, MdManageSearch, MdReceiptLong,
} from 'react-icons/md';
import { useTranslation } from '../../i18n';
import type { TranslationKey } from '../../i18n';

export type SidebarViewId = 'overview' | 'assets' | 'data';

interface AppSidebarProps {
    activePage: 'home' | 'deep-dive' | 'screener' | 'taxes' | 'about';
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

type NavItem = { id: SidebarViewId; labelKey: TranslationKey; icon: React.ComponentType<{ size?: number }> };

const OVERVIEW_ITEM: NavItem = { id: 'overview', labelKey: 'nav.overview', icon: MdHome };
const ASSETS_ITEM: NavItem = { id: 'assets', labelKey: 'nav.assets', icon: MdAccountBalance };

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
    const { t } = useTranslation();

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

            {/* Active portfolio — doubles as the nav entry into the portfolio management view */}
            {activeSetName && (
                <button
                    onClick={() => {
                        if (onHome && onViewChange) onViewChange('data');
                        else router.push('/?view=data');
                    }}
                    className="w-full px-4 py-3 flex items-center gap-2.5 flex-shrink-0 text-left transition-colors hover:opacity-80"
                    style={{
                        borderBottom: '1px solid var(--border)',
                        ...(onHome && activeView === 'data' ? activeStyle : defaultStyle),
                    }}>
                    <PortfoliosIcon size={18} />
                    <div className="min-w-0">
                        <div className="text-[11px] font-semibold uppercase tracking-widest"
                            style={{ color: 'var(--text-muted)' }}>
                            {t('sidebar.activePortfolio')}
                        </div>
                        <div className="text-sm font-medium truncate" title={activeSetName}
                            style={{ color: 'var(--text-primary)' }}>
                            {activeSetName}
                        </div>
                    </div>
                </button>
            )}

            {/* Nav — Overview · Analysis · Assets · Screener */}
            <nav className="flex-1 px-3 py-4 space-y-0.5">
                {(() => {
                    const viewButton = ({ id, labelKey, icon: Icon }: NavItem) => {
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
                                {t(labelKey)}
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
                                    {t('nav.analysis')}
                                </div>
                            ) : (
                                <button
                                    onClick={() => router.push('/returns/deep-dive')}
                                    className={itemClass}
                                    style={defaultStyle}>
                                    <MdTrendingUp size={17} />
                                    {t('nav.analysis')}
                                </button>
                            )}

                            {viewButton(ASSETS_ITEM)}

                            {/* Screener — separate page for researching stocks before buying */}
                            {activePage === 'screener' ? (
                                <div className={itemClass} style={activeStyle}>
                                    <MdManageSearch size={17} />
                                    {t('nav.screener')}
                                </div>
                            ) : (
                                <button
                                    onClick={() => router.push('/screener')}
                                    className={itemClass}
                                    style={defaultStyle}>
                                    <MdManageSearch size={17} />
                                    {t('nav.screener')}
                                </button>
                            )}

                            {/* Taxes — standalone board for tax setup and estimates */}
                            {activePage === 'taxes' ? (
                                <div className={itemClass} style={activeStyle}>
                                    <MdReceiptLong size={17} />
                                    {t('nav.taxes')}
                                </div>
                            ) : (
                                <button
                                    onClick={() => router.push('/taxes')}
                                    className={itemClass}
                                    style={defaultStyle}>
                                    <MdReceiptLong size={17} />
                                    {t('nav.taxes')}
                                </button>
                            )}
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
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('sidebar.baseCurrency')}</span>
                </div>
                {/* About — how the app is built, and what leaves the browser */}
                {activePage === 'about' ? (
                    <div className={itemClass} style={activeStyle}>
                        <MdInfoOutline size={17} />
                        {t('nav.about')}
                    </div>
                ) : (
                    <button
                        onClick={() => router.push('/about')}
                        className={itemClass}
                        style={defaultStyle}>
                        <MdInfoOutline size={17} />
                        {t('nav.about')}
                    </button>
                )}
                {onHome && onSettingsClick ? (
                    <button
                        onClick={onSettingsClick}
                        className={itemClass}
                        style={defaultStyle}
                        aria-label={t('settings.open')}>
                        <MdSettings size={17} />
                        {t('nav.settings')}
                    </button>
                ) : (
                    <button
                        onClick={() => router.push('/')}
                        className={itemClass}
                        style={defaultStyle}>
                        <MdSettings size={17} />
                        {t('nav.settings')}
                    </button>
                )}
            </div>
        </aside>
    );
}
