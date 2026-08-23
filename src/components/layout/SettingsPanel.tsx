'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { MdClose, MdLightMode, MdDarkMode } from 'react-icons/md';
import { SUPPORTED_BASE_CURRENCIES, BaseCurrency } from '../../hooks/useBaseCurrency';
import { useTranslation, SUPPORTED_LANGUAGES } from '../../i18n';
import { ExchangeRatesSection } from './ExchangeRatesSection';

interface SettingsPanelProps {
    open: boolean;
    onClose: () => void;
    currency: BaseCurrency;
    onCurrencyChange: (currency: BaseCurrency) => void;
}

export const SettingsPanel = ({ open, onClose, currency, onCurrencyChange }: SettingsPanelProps) => {
    const { resolvedTheme, setTheme } = useTheme();
    const { t, language, setLanguage } = useTranslation();
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    useEffect(() => {
        document.body.style.overflow = open ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [open]);

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                className="fixed inset-0 z-40 transition-opacity duration-300"
                style={{
                    background: 'rgba(0,0,0,0.45)',
                    backdropFilter: 'blur(2px)',
                    opacity: open ? 1 : 0,
                    pointerEvents: open ? 'auto' : 'none',
                }}
                aria-hidden="true"
            />

            {/* Drawer */}
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label={t('settings.title')}
                className="fixed top-0 right-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] md:bottom-0 z-50 flex flex-col"
                style={{
                    width: 'min(480px, 100vw)',
                    background: 'var(--surface-popover)',
                    borderLeft: '1px solid var(--border)',
                    transform: open ? 'translateX(0)' : 'translateX(100%)',
                    transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: open ? '-8px 0 32px rgba(0,0,0,0.4)' : 'none',
                }}
            >
                {/* Panel header */}
                <div className="flex items-center justify-between px-6 py-5"
                    style={{ borderBottom: '1px solid var(--border)' }}>
                    <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {t('settings.title')}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg transition-colors"
                        style={{ color: 'var(--text-muted)' }}
                        aria-label={t('settings.close')}
                    >
                        <MdClose size={18} />
                    </button>
                </div>

                {/* Scrollable content */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8">

                    {/* Appearance section */}
                    <section className="space-y-3">
                        <h3 className="text-xs font-semibold uppercase tracking-widest"
                            style={{ color: 'var(--text-muted)' }}>
                            {t('settings.appearance')}
                        </h3>

                        {/* Theme */}
                        <div className="glass rounded-xl p-4 flex items-center justify-between gap-4">
                            <div>
                                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('settings.theme')}</p>
                                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                    {resolvedTheme === 'dark' ? t('settings.darkMode') : t('settings.lightMode')}
                                </p>
                            </div>
                            <button
                                onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium glass glass-hover transition-all"
                                style={{ color: 'var(--accent)', border: '1px solid var(--accent-glow)' }}
                                aria-label={t('settings.toggleTheme')}
                            >
                                {resolvedTheme === 'dark'
                                    ? <><MdLightMode size={16} /> {t('settings.light')}</>
                                    : <><MdDarkMode size={16} /> {t('settings.dark')}</>
                                }
                            </button>
                        </div>

                        {/* Language — labels stay in their own language, never translated */}
                        <div className="glass rounded-xl p-4 space-y-3">
                            <div>
                                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('settings.language')}</p>
                                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                    {t('settings.languageHelp')}
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                {SUPPORTED_LANGUAGES.map(l => (
                                    <button
                                        key={l.code}
                                        onClick={() => setLanguage(l.code)}
                                        lang={l.code}
                                        aria-pressed={language === l.code}
                                        className="px-3 py-2.5 rounded-xl text-sm font-medium transition-all"
                                        style={language === l.code ? {
                                            background: 'var(--accent-dim)',
                                            color: 'var(--accent)',
                                            border: '1px solid var(--accent-glow)',
                                        } : {
                                            background: 'var(--glass-bg)',
                                            color: 'var(--text-secondary)',
                                            border: '1px solid var(--border)',
                                        }}
                                    >
                                        {l.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Base currency */}
                        <div className="glass rounded-xl p-4 space-y-3">
                            <div>
                                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('settings.baseCurrency')}</p>
                                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                    {t('settings.baseCurrencyHelp')}
                                </p>
                            </div>
                            <div className="grid grid-cols-4 gap-2">
                                {SUPPORTED_BASE_CURRENCIES.map(c => (
                                    <button
                                        key={c.code}
                                        onClick={() => onCurrencyChange(c.code)}
                                        className="flex flex-col items-center gap-1 px-2 py-3 rounded-xl text-xs font-medium transition-all"
                                        style={currency === c.code ? {
                                            background: 'var(--accent-dim)',
                                            color: 'var(--accent)',
                                            border: '1px solid var(--accent-glow)',
                                        } : {
                                            background: 'var(--glass-bg)',
                                            color: 'var(--text-secondary)',
                                            border: '1px solid var(--border)',
                                        }}
                                    >
                                        <span className="text-lg font-semibold">{c.symbol}</span>
                                        <span>{c.code}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </section>

                    {/* Exchange rates — read-only view of the FX rates used for valuation */}
                    <ExchangeRatesSection open={open} currency={currency} />

                    {/* Version + build info — confirms which commit is live in the browser.
                        These are build-time stamps inlined at compile time; the server and
                        client bundles can be compiled at different commit counts during dev
                        recompiles, so suppress the resulting hydration text mismatch. */}
                    <section className="pt-2 text-xs space-y-1" style={{ color: 'var(--text-muted)' }}>
                        <div>
                            {t('settings.version')}:{' '}
                            <code style={{ color: 'var(--text-secondary)' }} suppressHydrationWarning>
                                {process.env.NEXT_PUBLIC_APP_VERSION ?? '0.1.0'}
                            </code>
                        </div>
                        <div suppressHydrationWarning>
                            {t('settings.build')}:{' '}
                            <code style={{ color: 'var(--text-secondary)' }}>
                                {process.env.NEXT_PUBLIC_BUILD_SHA?.slice(0, 7) ?? 'dev'}
                            </code>
                            {process.env.NEXT_PUBLIC_BUILD_DATE && (
                                <> · {process.env.NEXT_PUBLIC_BUILD_DATE}</>
                            )}
                        </div>
                    </section>
                </div>
            </div>
        </>
    );
};
