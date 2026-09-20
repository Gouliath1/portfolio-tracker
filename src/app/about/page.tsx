'use client';

/**
 * About — what this app is, and how it is put together.
 *
 * The app makes an unusual promise (holdings never leave the browser), and a
 * promise like that is only worth anything if the user can see the shape of
 * the system that keeps it. So this page leads with the architecture rather
 * than with a feature list.
 */

import { useEffect, useState } from 'react';
import { AppSidebar } from '../../components/layout/AppSidebar';
import { SettingsPanel } from '../../components/layout/SettingsPanel';
import { MobileBottomNav } from '../../components/layout/MobileBottomNav';
import { ArchitectureDiagram } from '../../components/about/ArchitectureDiagram';
import { ServerDataPanel } from '../../components/about/ServerDataPanel';
import { useBaseCurrency } from '../../hooks/useBaseCurrency';
import { useActiveSetName } from '../../hooks/useActiveSetName';
import { useTaxFeatureEnabled } from '../../hooks/useTaxFeatureEnabled';
import { useTranslation } from '../../i18n';
import type { TranslationKey } from '../../i18n';

const PRIVACY_POINTS: TranslationKey[] = [
    'about.privacyLeaves',
    'about.privacyStays',
];

export default function AboutPage() {
    const { t } = useTranslation();
    const [mounted, setMounted] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const { currency, setCurrency } = useBaseCurrency();
    const activeSetName = useActiveSetName();
    const { enabled: taxFeatureEnabled, setEnabled: setTaxFeatureEnabled } = useTaxFeatureEnabled();

    useEffect(() => { setMounted(true); }, []);

    if (!mounted) return null;

    return (
        <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-base)' }}>

            <AppSidebar activePage="about" currency={currency} activeSetName={activeSetName} taxFeatureEnabled={taxFeatureEnabled} />

            <div className="flex-1 min-w-0 md:ml-[200px] flex flex-col h-screen overflow-hidden">
                <main className="flex-1 min-h-0 scroll-elastic-y pb-20 md:pb-0">
                    <div className="w-full max-w-screen-lg mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-6">

                        {/* Page header */}
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-widest mb-1"
                                style={{ color: 'var(--text-muted)' }}>{t('nav.about')}</p>
                            <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                                {t('about.title')}
                            </h1>
                            <p className="text-sm mt-1 max-w-2xl leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                                {t('about.subtitle')}
                            </p>
                        </div>

                        {/* ── Architecture ─────────────────────────────── */}
                        <section className="glass rounded-xl p-4 sm:p-6">
                            <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                                {t('about.architecture')}
                            </h2>
                            <ArchitectureDiagram />
                        </section>

                        {/* ── Your data on the server ──────────────────── */}
                        <ServerDataPanel />

                        {/* ── What leaves the browser ──────────────────── */}
                        <section className="rounded-xl p-4 sm:p-6"
                            style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-glow)' }}>
                            <h2 className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>
                                {t('about.privacyTitle')}
                            </h2>
                            <ul className="mt-3 space-y-2">
                                {PRIVACY_POINTS.map(key => (
                                    <li key={key} className="flex gap-2.5 text-xs leading-relaxed"
                                        style={{ color: 'var(--text-secondary)' }}>
                                        <span aria-hidden="true" style={{ color: 'var(--accent)' }}>•</span>
                                        <span>{t(key)}</span>
                                    </li>
                                ))}
                            </ul>
                        </section>

                        {/* ── Stack + build ────────────────────────────── */}
                        <section className="glass rounded-xl p-4 sm:p-6">
                            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                                {t('about.stackTitle')}
                            </h2>
                            <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                                {t('about.stackItems')}
                            </p>

                            {/* Build stamps are inlined at compile time; the server and client
                                bundles can differ during dev recompiles, so suppress the
                                resulting hydration text mismatch (same as the settings panel). */}
                            <div className="mt-4 pt-4 text-xs space-y-1"
                                style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}>
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
                            </div>
                        </section>
                    </div>
                </main>
            </div>

            <MobileBottomNav
                activePage="about"
                settingsOpen={settingsOpen}
                onSettingsToggle={() => setSettingsOpen(o => !o)}
            />

            <SettingsPanel
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                currency={currency}
                onCurrencyChange={setCurrency}
                taxFeatureEnabled={taxFeatureEnabled}
                onTaxFeatureEnabledChange={setTaxFeatureEnabled}
            />
        </div>
    );
}
