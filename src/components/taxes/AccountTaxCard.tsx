'use client';

import { useTranslation } from '../../i18n';
import { formatCurrencyValue } from '../tables/positionsTable/currencyUtils';
import {
    WRAPPERS_BY_COUNTRY, TAX_COUNTRIES, suggestedRates, isWrapperRecognized,
    type AccountTaxSetting, type TaxCountry, type TaxResidenceCountry, type AccountWrapper, type RateOverrides,
} from '@portfolio/core';

interface AccountTaxCardProps {
    account: string;
    residenceCountry: TaxResidenceCountry | null;
    setting: AccountTaxSetting;
    onChange: (patch: Partial<AccountTaxSetting>) => void;
    /** Sum of per-lot capital-gains tax for this account (not raw gain — a loss on one lot doesn't offset a gain on another). */
    capitalGainsTaxJpy: number;
    /** Raw dividend income received in this account — taxed once at the account's rate, equivalent to summing per-dividend tax since income is never negative. */
    dividendIncomeJpy: number;
}

const inputStyle: React.CSSProperties = {
    background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--border)',
};

const countryLabelKey: Record<TaxCountry, 'settings.taxResidenceFR' | 'settings.taxResidenceJP' | 'taxes.countryUS' | 'taxes.countryOther'> = {
    FR: 'settings.taxResidenceFR', JP: 'settings.taxResidenceJP', US: 'taxes.countryUS', OTHER: 'taxes.countryOther',
};
const wrapperLabelKey: Record<Exclude<AccountWrapper, 'NONE'>, 'settings.taxWrapperPEA' | 'settings.taxWrapperCTO' | 'settings.taxWrapperNISA' | 'settings.taxWrapperTAXABLE'> = {
    PEA: 'settings.taxWrapperPEA', CTO: 'settings.taxWrapperCTO', NISA: 'settings.taxWrapperNISA', TAXABLE: 'settings.taxWrapperTAXABLE',
};

function RateField({ label, value, suggested, onChange, onReset }: {
    label: string; value: number; suggested: number;
    onChange: (fraction: number) => void; onReset: () => void;
}) {
    const isOverridden = Math.abs(value - suggested) > 1e-9;
    return (
        <label className="flex items-center justify-between gap-2">
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</span>
            <span className="flex items-center gap-1">
                <input
                    type="number" step="0.1" min="0" max="100"
                    value={(value * 100).toFixed(2).replace(/\.?0+$/, '') || '0'}
                    onChange={e => {
                        const pct = parseFloat(e.target.value);
                        if (!Number.isNaN(pct)) onChange(pct / 100);
                    }}
                    className="w-16 text-xs text-right rounded-lg px-2 py-1 tabular-nums"
                    style={{ ...inputStyle, ...(isOverridden ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}) }}
                />
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>%</span>
                {isOverridden && (
                    <button onClick={onReset} className="text-xs px-1 hover:opacity-70" style={{ color: 'var(--accent)' }} title="Reset to suggested">
                        ↺
                    </button>
                )}
            </span>
        </label>
    );
}

/**
 * One account's tax setup: home country → wrapper (cascading, so the picker
 * never offers a wrapper from the wrong country), the treaty-form toggle that
 * feeds the suggested dividend withholding rate, and an editable rate
 * breakdown — every field pre-filled with the engine's suggestion but freely
 * overridable, per account.
 */
export const AccountTaxCard = ({ account, residenceCountry, setting, onChange, capitalGainsTaxJpy, dividendIncomeJpy }: AccountTaxCardProps) => {
    const { t, locale } = useTranslation();

    const wrapperOptions = setting.country ? WRAPPERS_BY_COUNTRY[setting.country] : [];
    const suggested = residenceCountry ? suggestedRates(residenceCountry, setting) : null;
    const recognized = residenceCountry && setting.wrapper !== 'NONE' ? isWrapperRecognized(residenceCountry, setting.wrapper) : null;

    const setOverride = (patch: Partial<RateOverrides>) => {
        onChange({ overrides: { ...setting.overrides, ...patch } });
    };
    const clearOverride = (key: keyof RateOverrides) => {
        const next = { ...setting.overrides };
        delete next[key];
        onChange({ overrides: next });
    };

    return (
        <div className="glass rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{account}</h3>
                {recognized !== null && (
                    <span
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={recognized
                            ? { background: 'var(--accent-dim)', color: 'var(--accent)' }
                            : { background: 'var(--glass-bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                    >
                        {recognized ? t('taxes.wrapperRecognized') : t('taxes.wrapperNotRecognized')}
                    </span>
                )}
            </div>

            {/* Country → wrapper cascade */}
            <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('taxes.accountCountry')}</span>
                    <select
                        value={setting.country ?? ''}
                        onChange={e => {
                            const country = (e.target.value || null) as TaxCountry | null;
                            onChange({ country, wrapper: 'NONE' });
                        }}
                        className="w-full text-sm rounded-lg px-2 py-1.5"
                        style={inputStyle}
                    >
                        <option value="">{t('common.notApplicable')}</option>
                        {TAX_COUNTRIES.map(c => (
                            <option key={c} value={c}>{t(countryLabelKey[c])}</option>
                        ))}
                    </select>
                </label>
                <label className="space-y-1">
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('taxes.wrapper')}</span>
                    <select
                        value={setting.wrapper}
                        disabled={!setting.country}
                        onChange={e => onChange({ wrapper: e.target.value as AccountWrapper })}
                        className="w-full text-sm rounded-lg px-2 py-1.5 disabled:opacity-50"
                        style={inputStyle}
                    >
                        <option value="NONE">{t('settings.taxWrapperNone')}</option>
                        {wrapperOptions.map(w => (
                            <option key={w} value={w}>{t(wrapperLabelKey[w])}</option>
                        ))}
                    </select>
                </label>
            </div>

            {setting.wrapper === 'NONE' && (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('taxes.setupHint')}</p>
            )}

            {setting.wrapper !== 'NONE' && (
                <>
                    {/* PEA account-opening date — the 5-year clock is the account's age, not each security's */}
                    {setting.wrapper === 'PEA' && (
                        <label className="flex items-center justify-between gap-2">
                            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('taxes.accountOpenedDate')}</span>
                            <input
                                type="date"
                                value={setting.accountOpenedDate ?? ''}
                                onChange={e => onChange({ accountOpenedDate: e.target.value || undefined })}
                                className="text-xs rounded-lg px-2 py-1"
                                style={inputStyle}
                            />
                        </label>
                    )}

                    {/* Treaty-form toggle — only meaningful for countries with a known reduced rate */}
                    {(setting.country === 'FR' || setting.country === 'US') && (
                        <label className="flex items-center justify-between gap-2">
                            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                {t(setting.country === 'FR' ? 'taxes.treatyFormOnFileFR' : 'taxes.treatyFormOnFileUS')}
                            </span>
                            <input
                                type="checkbox"
                                checked={setting.treatyFormOnFile ?? false}
                                onChange={e => onChange({ treatyFormOnFile: e.target.checked })}
                            />
                        </label>
                    )}

                    {suggested && (
                        <div className="grid sm:grid-cols-2 gap-3 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                            <div className="space-y-1.5">
                                <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{t('taxes.capitalGains')}</p>
                                <RateField label={t('taxes.incomeRate')} value={setting.overrides?.capitalGainsIncomeRate ?? suggested.capitalGains.incomeRate} suggested={suggested.capitalGains.incomeRate}
                                    onChange={v => setOverride({ capitalGainsIncomeRate: v })} onReset={() => clearOverride('capitalGainsIncomeRate')} />
                                <RateField label={t('taxes.socialRate')} value={setting.overrides?.capitalGainsSocialRate ?? suggested.capitalGains.socialRate} suggested={suggested.capitalGains.socialRate}
                                    onChange={v => setOverride({ capitalGainsSocialRate: v })} onReset={() => clearOverride('capitalGainsSocialRate')} />
                                <RateField label={t('taxes.sourceRate')} value={setting.overrides?.capitalGainsSourceRate ?? suggested.capitalGains.sourceRate} suggested={suggested.capitalGains.sourceRate}
                                    onChange={v => setOverride({ capitalGainsSourceRate: v })} onReset={() => clearOverride('capitalGainsSourceRate')} />
                                <p className="text-xs pt-1" style={{ color: 'var(--text-muted)' }}>
                                    {t('taxes.ifSoldToday')}: <span className="font-medium tabular-nums" style={{ color: 'var(--text-secondary)' }}>{formatCurrencyValue(capitalGainsTaxJpy, 'JPY', true, locale)}</span>
                                </p>
                            </div>
                            <div className="space-y-1.5">
                                <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{t('taxes.dividends')}</p>
                                <RateField label={t('taxes.incomeRate')} value={setting.overrides?.dividendIncomeRate ?? suggested.dividends.incomeRate} suggested={suggested.dividends.incomeRate}
                                    onChange={v => setOverride({ dividendIncomeRate: v })} onReset={() => clearOverride('dividendIncomeRate')} />
                                <RateField label={t('taxes.socialRate')} value={setting.overrides?.dividendSocialRate ?? suggested.dividends.socialRate} suggested={suggested.dividends.socialRate}
                                    onChange={v => setOverride({ dividendSocialRate: v })} onReset={() => clearOverride('dividendSocialRate')} />
                                <RateField label={t('taxes.sourceRate')} value={setting.overrides?.dividendSourceRate ?? suggested.dividends.sourceRate} suggested={suggested.dividends.sourceRate}
                                    onChange={v => setOverride({ dividendSourceRate: v })} onReset={() => clearOverride('dividendSourceRate')} />
                                <p className="text-xs pt-1" style={{ color: 'var(--text-muted)' }}>
                                    {t('taxes.onDividendsReceived')}: <span className="font-medium tabular-nums" style={{ color: 'var(--text-secondary)' }}>{formatCurrencyValue(dividendIncomeJpy, 'JPY', true, locale)}</span>
                                </p>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};
