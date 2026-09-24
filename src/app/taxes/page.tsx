'use client';

/**
 * Taxes — standalone board for tax setup and estimates.
 *
 * Split out of the Settings drawer once the per-account setup grew real
 * structure (country → wrapper cascade, treaty toggles, editable rate
 * breakdown for capital gains AND dividends). Always reasons in JPY — the
 * taxpayer's reporting currency per the tax model — independent of whatever
 * currency the rest of the app displays in.
 */

import { useEffect, useMemo, useState } from 'react';
import { AppSidebar } from '../../components/layout/AppSidebar';
import { SettingsPanel } from '../../components/layout/SettingsPanel';
import { MobileBottomNav } from '../../components/layout/MobileBottomNav';
import { AccountTaxCard } from '../../components/taxes/AccountTaxCard';
import { WipBadge } from '../../components/shared/WipBadge';
import { useBaseCurrency } from '../../hooks/useBaseCurrency';
import { useActiveSetName } from '../../hooks/useActiveSetName';
import { usePortfolioSummaryData } from '../../hooks/usePortfolioSummaryData';
import { useTaxResidence } from '../../hooks/useTaxResidence';
import { useAccountTaxSettings } from '../../hooks/useAccountTaxSettings';
import { useTaxFeatureEnabled } from '../../hooks/useTaxFeatureEnabled';
import { formatCurrencyValue } from '../../components/tables/positionsTable/currencyUtils';
import { estimateCapitalGainsTax, estimateDividendTax, TAX_RULES_AS_OF, DEFAULT_ACCOUNT_TAX_SETTING, TAX_COUNTRIES, type TaxCountry } from '@portfolio/core';
import { useTranslation } from '../../i18n';

/** Both date conventions in use ('YYYY/MM/DD' transactions, 'YYYY-MM-DD' dividend ex-dates) start with the year — reading it directly avoids timezone-dependent Date parsing. */
function yearOf(dateStr: string): number {
    return parseInt(dateStr.slice(0, 4), 10);
}

const countryLabelKey: Record<TaxCountry, 'settings.taxResidenceFR' | 'settings.taxResidenceJP' | 'taxes.countryUS' | 'taxes.countryOther'> = {
    FR: 'settings.taxResidenceFR', JP: 'settings.taxResidenceJP', US: 'taxes.countryUS', OTHER: 'taxes.countryOther',
};

export default function TaxesPage() {
    const { t, locale } = useTranslation();
    const [mounted, setMounted] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const { currency, setCurrency } = useBaseCurrency();
    const activeSetName = useActiveSetName();
    const { summary } = usePortfolioSummaryData('JPY');
    const { residenceCountry, setResidenceCountry } = useTaxResidence();
    const { settings, updateAccountSetting } = useAccountTaxSettings();
    const { enabled: taxFeatureEnabled, setEnabled: setTaxFeatureEnabled, hydrated: taxFeatureHydrated } = useTaxFeatureEnabled();

    useEffect(() => { setMounted(true); }, []);

    const accountNames = useMemo(() => {
        if (!summary) return [];
        return [...new Set([...summary.positions, ...summary.closedPositions].map(p => p.account))].sort();
    }, [summary]);

    // Unrealized preview — "if I sold every open position today." Distinct
    // from the tax-year section below, which reports what actually happened
    // (realized gains, dividends received) rather than a hypothetical.
    const unrealizedCapitalGainsTax = useMemo(() => {
        if (!summary || !residenceCountry) return null;
        let total = 0;
        let anyConfigured = false;
        for (const p of summary.positions) {
            const setting = settings[p.account] ?? DEFAULT_ACCOUNT_TAX_SETTING;
            if (setting.wrapper === 'NONE') continue;
            const holdingDays = Math.floor((Date.now() - new Date(p.transactionDate).getTime()) / (1000 * 60 * 60 * 24));
            const est = estimateCapitalGainsTax({ gain: p.pnlJPY, holdingDays, residenceCountry, setting });
            if (est) { total += est.totalTax; anyConfigured = true; }
        }
        return anyConfigured ? total : null;
    }, [summary, residenceCountry, settings]);

    // Per-account preview figures shown on each card. Capital gains are
    // summed as TAX, not raw gain — lots are taxed individually (a loss on
    // one lot doesn't offset a gain on another for an unrealized estimate),
    // so summing raw pnlJPY first would understate what the portfolio-level
    // total above actually charges. Dividends don't have that asymmetry
    // (income is never negative), so a raw sum taxed once is equivalent.
    const perAccountAmounts = useMemo(() => {
        const capitalGainsTax = new Map<string, number>();
        const dividendIncome = new Map<string, number>();
        if (!summary || !residenceCountry) return { capitalGainsTax, dividendIncome };
        for (const p of summary.positions) {
            const setting = settings[p.account] ?? DEFAULT_ACCOUNT_TAX_SETTING;
            if (setting.wrapper === 'NONE') continue;
            const holdingDays = Math.floor((Date.now() - new Date(p.transactionDate).getTime()) / (1000 * 60 * 60 * 24));
            const est = estimateCapitalGainsTax({ gain: p.pnlJPY, holdingDays, residenceCountry, setting });
            if (est) capitalGainsTax.set(p.account, (capitalGainsTax.get(p.account) ?? 0) + est.totalTax);
        }
        for (const p of [...summary.positions, ...summary.closedPositions]) {
            dividendIncome.set(p.account, (dividendIncome.get(p.account) ?? 0) + (p.dividendIncomeJPY ?? 0));
        }
        return { capitalGainsTax, dividendIncome };
    }, [summary, residenceCountry, settings]);

    // ── Tax year: what actually happened, not "if sold today" ───────────────
    // Different countries are owed different things: the residence country
    // gets self-declared tax on realized gains and dividends (net of any
    // foreign credit); a source country (e.g. France on French dividends) has
    // already had its share withheld by the broker before the cash arrived —
    // that portion is a completed fact, not something still to pay.
    const currentYear = new Date().getFullYear();
    const [selectedYear, setSelectedYear] = useState(currentYear);

    const availableYears = useMemo(() => {
        const years = new Set<number>([currentYear]);
        if (summary) {
            for (const p of summary.closedPositions) {
                if (p.saleDate) years.add(yearOf(p.saleDate));
            }
            for (const p of [...summary.positions, ...summary.closedPositions]) {
                for (const ev of p.dividendEvents ?? []) years.add(yearOf(ev.exDate));
            }
        }
        return [...years].sort((a, b) => b - a);
    }, [summary, currentYear]);

    const yearlySummary = useMemo(() => {
        if (!summary || !residenceCountry) return null;

        let capitalGainsTax = 0;
        let dividendResidenceTax = 0;
        const withheldBySourceCountry = new Map<TaxCountry, number>();
        const grossDividendBySourceCountry = new Map<TaxCountry, number>();
        let anyConfigured = false;

        for (const p of summary.closedPositions) {
            if (!p.saleDate || yearOf(p.saleDate) !== selectedYear) continue;
            const setting = settings[p.account] ?? DEFAULT_ACCOUNT_TAX_SETTING;
            if (setting.wrapper === 'NONE') continue;
            const holdingDays = Math.floor((new Date(p.saleDate.replace(/\//g, '-')).getTime() - new Date(p.transactionDate.replace(/\//g, '-')).getTime()) / (1000 * 60 * 60 * 24));
            const est = estimateCapitalGainsTax({ gain: p.realizedPnlJPY ?? 0, holdingDays, residenceCountry, setting });
            if (est) { capitalGainsTax += est.totalTax; anyConfigured = true; }
        }

        for (const p of [...summary.positions, ...summary.closedPositions]) {
            const setting = settings[p.account] ?? DEFAULT_ACCOUNT_TAX_SETTING;
            if (setting.wrapper === 'NONE') continue;
            const eventsThisYear = (p.dividendEvents ?? []).filter(ev => yearOf(ev.exDate) === selectedYear);
            if (eventsThisYear.length === 0) continue;
            const dividendIncome = eventsThisYear.reduce((s, ev) => s + ev.amountInBase, 0);
            const est = estimateDividendTax({ dividendIncome, residenceCountry, setting });
            if (!est) continue;
            anyConfigured = true;
            dividendResidenceTax += (est.incomeTax - est.credit) + est.socialTax;
            const country = setting.country ?? 'OTHER';
            withheldBySourceCountry.set(country, (withheldBySourceCountry.get(country) ?? 0) + est.sourceTax);
            grossDividendBySourceCountry.set(country, (grossDividendBySourceCountry.get(country) ?? 0) + dividendIncome);
        }

        if (!anyConfigured) return null;
        return {
            capitalGainsTax, dividendResidenceTax,
            toDeclare: capitalGainsTax + dividendResidenceTax,
            withheldBySourceCountry, grossDividendBySourceCountry,
        };
    }, [summary, residenceCountry, settings, selectedYear]);

    if (!mounted) return null;

    return (
        <div className="flex h-dvh overflow-hidden" style={{ background: 'var(--bg-base)' }}>
            <AppSidebar activePage="taxes" currency={currency} activeSetName={activeSetName} taxFeatureEnabled={taxFeatureEnabled} />

            <div className="flex-1 min-w-0 md:ml-[200px] flex flex-col h-dvh overflow-hidden">
                <main className="flex-1 min-h-0 scroll-elastic-y pb-20 md:pb-0">
                    <div className="w-full max-w-screen-lg mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-6">

                        {/* Page header */}
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-widest mb-1"
                                style={{ color: 'var(--text-muted)' }}>{t('nav.taxes')}</p>
                            <h1 className="text-xl font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                                {t('taxes.title')}
                                <WipBadge size="md" />
                            </h1>
                            <p className="text-sm mt-1 max-w-2xl leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                                {t('taxes.subtitle', { date: TAX_RULES_AS_OF })}
                            </p>
                        </div>

                        {!taxFeatureHydrated ? null : !taxFeatureEnabled ? (
                            <section className="glass rounded-xl p-4 sm:p-6 flex items-center justify-between gap-4 flex-wrap">
                                <div>
                                    <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t('taxes.hiddenTitle')}</h2>
                                    <p className="text-xs mt-1 max-w-md" style={{ color: 'var(--text-muted)' }}>{t('taxes.hiddenHelp')}</p>
                                </div>
                                <button
                                    onClick={() => setTaxFeatureEnabled(true)}
                                    className="px-4 py-2 rounded-lg text-sm font-medium transition-all flex-shrink-0"
                                    style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-glow)' }}
                                >
                                    {t('taxes.enableFeature')}
                                </button>
                            </section>
                        ) : (<>

                        {/* Tax residence — one value for the whole portfolio */}
                        <section className="glass rounded-xl p-4 sm:p-6 flex items-center justify-between gap-4 flex-wrap">
                            <div>
                                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t('settings.taxResidence')}</h2>
                                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{t('taxes.residenceHelp')}</p>
                            </div>
                            <div className="flex gap-2">
                                {(['FR', 'JP'] as const).map(c => (
                                    <button
                                        key={c}
                                        onClick={() => setResidenceCountry(c)}
                                        aria-pressed={residenceCountry === c}
                                        className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                                        style={residenceCountry === c ? {
                                            background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-glow)',
                                        } : { background: 'var(--glass-bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                                    >
                                        {t(c === 'FR' ? 'settings.taxResidenceFR' : 'settings.taxResidenceJP')}
                                    </button>
                                ))}
                            </div>
                        </section>

                        {/* Tax year — what actually happened, broken out by which country it's owed to */}
                        <section className="space-y-3">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t('taxes.taxYear')}</h2>
                                <div className="flex flex-wrap gap-1">
                                    {availableYears.map(y => (
                                        <button
                                            key={y}
                                            onClick={() => setSelectedYear(y)}
                                            aria-pressed={selectedYear === y}
                                            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                                            style={selectedYear === y ? {
                                                background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-glow)',
                                            } : { background: 'var(--glass-bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                                        >
                                            {y}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {!yearlySummary ? (
                                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('taxes.noActivityThisYear', { year: selectedYear })}</p>
                            ) : (
                                <div className="grid sm:grid-cols-2 gap-4">
                                    <div className="glass rounded-xl p-4" style={{ border: '1px solid var(--accent-glow)' }}>
                                        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--accent)' }}>
                                            {t('taxes.toDeclare')} — {residenceCountry && t(countryLabelKey[residenceCountry])}
                                        </p>
                                        <p className="text-xl font-semibold mt-1 tabular-nums" style={{ color: 'var(--text-primary)' }}>
                                            {formatCurrencyValue(yearlySummary.toDeclare, 'JPY', true, locale)}
                                        </p>
                                        <div className="text-xs mt-2 space-y-0.5" style={{ color: 'var(--text-muted)' }}>
                                            <p>{t('taxes.capitalGains')}: {formatCurrencyValue(yearlySummary.capitalGainsTax, 'JPY', true, locale)}</p>
                                            <p>{t('taxes.dividendsResidenceShare')}: {formatCurrencyValue(yearlySummary.dividendResidenceTax, 'JPY', true, locale)}</p>
                                        </div>
                                    </div>

                                    {TAX_COUNTRIES.filter(c => (yearlySummary.withheldBySourceCountry.get(c) ?? 0) > 0).map(c => (
                                        <div key={c} className="glass rounded-xl p-4">
                                            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                                                {t('taxes.alreadyWithheld')} — {t(countryLabelKey[c])}
                                            </p>
                                            <p className="text-xl font-semibold mt-1 tabular-nums" style={{ color: 'var(--text-primary)' }}>
                                                {formatCurrencyValue(yearlySummary.withheldBySourceCountry.get(c) ?? 0, 'JPY', true, locale)}
                                            </p>
                                            <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                                                {t('taxes.onGrossDividends', { amount: formatCurrencyValue(yearlySummary.grossDividendBySourceCountry.get(c) ?? 0, 'JPY', true, locale) })}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>

                        {/* Unrealized — "if I sold everything today" */}
                        {unrealizedCapitalGainsTax !== null && (
                            <section className="glass rounded-xl p-4">
                                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{t('taxes.totalCapitalGainsTax')}</p>
                                <p className="text-xl font-semibold mt-1 tabular-nums" style={{ color: 'var(--text-primary)' }}>
                                    {formatCurrencyValue(unrealizedCapitalGainsTax, 'JPY', true, locale)}
                                </p>
                                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{t('taxes.ifSoldTodayHelp')}</p>
                            </section>
                        )}

                        {/* Per-account setup */}
                        <section className="space-y-3">
                            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t('taxes.accounts')}</h2>
                            {accountNames.length === 0 ? (
                                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('taxes.noAccounts')}</p>
                            ) : (
                                <div className="grid sm:grid-cols-2 gap-4">
                                    {accountNames.map(account => (
                                        <AccountTaxCard
                                            key={account}
                                            account={account}
                                            residenceCountry={residenceCountry}
                                            setting={settings[account] ?? DEFAULT_ACCOUNT_TAX_SETTING}
                                            onChange={patch => updateAccountSetting(account, patch)}
                                            capitalGainsTaxJpy={perAccountAmounts.capitalGainsTax.get(account) ?? 0}
                                            dividendIncomeJpy={perAccountAmounts.dividendIncome.get(account) ?? 0}
                                        />
                                    ))}
                                </div>
                            )}
                        </section>
                        </>)}
                    </div>
                </main>
            </div>

            <MobileBottomNav
                activePage="taxes"
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
