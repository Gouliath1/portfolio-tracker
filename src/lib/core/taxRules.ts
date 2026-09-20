import { Position } from '@portfolio/types';

/**
 * Capital-gains and dividend tax ESTIMATE engine — not tax advice.
 *
 * Model: tax residence is a property of the taxpayer, not the account — ONE
 * residence country applies to every account. Each account additionally
 * carries its own home country (where its wrapper is legally defined — a PEA
 * is inherently French, a NISA inherently Japanese) and a wrapper within that
 * country. Whether the wrapper's tax advantage actually applies depends on
 * whether the *residence* country recognizes it — e.g. a Japan tax resident
 * gets no benefit from a French PEA; France doesn't recognize a Japanese
 * NISA. An unrecognized wrapper is just taxed as an ordinary account under
 * the residence country's domestic rules.
 *
 * Two separate income types are modeled, because they're taxed differently:
 * - Capital gains: under most tax treaties, portfolio shareholdings are
 *   taxable only in the residence country (no source-country tax to credit)
 *   — the exception is a "substantial holding" carve-out some treaties
 *   include, exposed here as an overridable (default 0) source rate.
 * - Dividends: DO have real source-country withholding, creditable against
 *   the residence country's tax on the same dividend (standard credit
 *   method: capped at the residence-country income-tax liability).
 *
 * Every rate is a *suggestion* — derived from the account's country/wrapper
 * and, for dividends, a "reduced treaty rate on file" toggle (e.g. CERFA
 * 5000/5001 for French dividends, a correctly-filed W-8BEN for US dividends)
 * — that the user can freely override per account. Overrides always win.
 *
 * Rates are current as of TAX_RULES_AS_OF. Real-world application depends on
 * specifics this engine doesn't model (a substantial-holding exception, cost-
 * basis method mismatches — Japan generally requires a total-average-cost
 * method rather than this app's FIFO lots, progressive "miscellaneous
 * income" brackets for things like crypto, loss carryforward) — verify with
 * a professional before relying on these numbers.
 */
export const TAX_RULES_AS_OF = '2026-01-01';

export type TaxResidenceCountry = 'FR' | 'JP';
/** The account's own home/legal country — where its wrapper is defined. */
export type TaxCountry = 'FR' | 'JP' | 'US' | 'OTHER';
export type AccountWrapper = 'PEA' | 'CTO' | 'NISA' | 'TAXABLE' | 'NONE';

export const TAX_COUNTRIES: TaxCountry[] = ['FR', 'JP', 'US', 'OTHER'];

/** Which wrappers exist under each country — drives the cascading country → wrapper picker. */
export const WRAPPERS_BY_COUNTRY: Record<TaxCountry, Exclude<AccountWrapper, 'NONE'>[]> = {
    FR: ['PEA', 'CTO'],
    JP: ['NISA', 'TAXABLE'],
    US: ['TAXABLE'],
    OTHER: ['TAXABLE'],
};

export interface RateOverrides {
    capitalGainsIncomeRate?: number;
    capitalGainsSocialRate?: number;
    capitalGainsSourceRate?: number;
    dividendIncomeRate?: number;
    dividendSocialRate?: number;
    dividendSourceRate?: number;
}

export interface AccountTaxSetting {
    /** The account's own home country — null until the user picks one; gates which wrappers are offered. */
    country: TaxCountry | null;
    /** 'NONE' = not configured — the account is skipped everywhere (shows N/A), never silently assumed. */
    wrapper: AccountWrapper;
    /** Feeds the suggested dividend source-withholding rate (10% vs 12.8% for FR, 15% vs 30% for US). */
    treatyFormOnFile?: boolean;
    /** PEA only: when the account was opened — the 5-year exemption clock runs from here, not from each security's own purchase date. Falls back to the lot's own date for capital gains, and to "not yet exempt" for dividends, when unset. */
    accountOpenedDate?: string;
    /** Per-field free-form overrides — always win over the suggested value. */
    overrides?: RateOverrides;
}

export const DEFAULT_ACCOUNT_TAX_SETTING: AccountTaxSetting = { country: null, wrapper: 'NONE' };

export interface TaxBreakdown {
    incomeTax: number;
    socialTax: number;
    sourceTax: number;
    /** Foreign tax credit applied against incomeTax (capped at that liability). */
    credit: number;
    /** (incomeTax − credit) + socialTax + sourceTax */
    totalTax: number;
    /** totalTax / amount, or 0 when amount <= 0. */
    effectiveRate: number;
    residenceLabel: string;
    sourceLabel: string;
}

interface RatePair { incomeRate: number; socialRate: number; label: string; }
interface RateLeg { incomeRate: number; socialRate: number; sourceRate: number; residenceLabel: string; sourceLabel: string; }
export interface RateBreakdown {
    capitalGains: RateLeg;
    dividends: RateLeg;
}

/** Whether `residenceCountry` grants `wrapper` its home-country tax-advantaged treatment. */
export function isWrapperRecognized(residenceCountry: TaxResidenceCountry, wrapper: AccountWrapper): boolean {
    if (residenceCountry === 'FR' && wrapper === 'PEA') return true;
    if (residenceCountry === 'JP' && wrapper === 'NISA') return true;
    return false;
}

function residenceRates(residenceCountry: TaxResidenceCountry, wrapper: AccountWrapper, holdingDays: number): RatePair {
    const recognized = isWrapperRecognized(residenceCountry, wrapper);

    if (residenceCountry === 'FR') {
        if (recognized) {
            const exempt = holdingDays > 5 * 365;
            return exempt
                ? { incomeRate: 0, socialRate: 0.172, label: 'PEA, held > 5y: exempt from income tax, 17.2% social contributions' }
                : { incomeRate: 0.128, socialRate: 0.186, label: 'PEA, held ≤ 5y: 31.4% flat tax (early withdrawal)' };
        }
        return { incomeRate: 0.128, socialRate: 0.186, label: 'Ordinary taxable account, France resident: 31.4% flat tax (PFU)' };
    }

    // residenceCountry === 'JP'
    if (recognized) {
        return { incomeRate: 0, socialRate: 0, label: 'NISA: tax-free (within contribution limits)' };
    }
    return {
        incomeRate: 0.20315, socialRate: 0,
        label: wrapper === 'PEA' || wrapper === 'CTO'
            ? `Japan tax residence: ${wrapper} is a French wrapper Japan doesn't recognize — taxed as an ordinary account, 20.315% flat`
            : 'Ordinary taxable account, Japan resident: 20.315% flat',
    };
}

function dividendSourceRate(accountCountry: TaxCountry | null, treatyFormOnFile: boolean | undefined): { rate: number; label: string } {
    switch (accountCountry) {
        case 'FR':
            return treatyFormOnFile
                ? { rate: 0.10, label: 'French dividends, treaty rate (CERFA 5000/5001 on file): 10%' }
                : { rate: 0.128, label: 'French dividends, standard withholding (no treaty form on file): 12.8%' };
        case 'US':
            return treatyFormOnFile
                ? { rate: 0.15, label: 'US dividends, treaty rate (correct-residence W-8BEN on file): 15%' }
                : { rate: 0.30, label: 'US dividends, standard withholding (no/incorrect W-8BEN): 30%' };
        default:
            return { rate: 0, label: 'No separate source withholding modeled for this country' };
    }
}

// Portfolio capital gains are, under most tax treaties, taxable only in the
// residence country — so the suggested source rate is 0. Overridable for a
// substantial-holding exception or similar edge case this engine can't know about.
const CAPITAL_GAINS_SOURCE: { rate: number; label: string } = {
    rate: 0, label: 'Portfolio capital gains are typically taxable only in the residence country',
};

function daysSince(dateStr: string): number {
    return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

/** Capital gains use the lot's own holding period, unless a PEA's account-opening date is on file — the 5-year clock is the account's age, not each security's. */
function holdingDaysForCapitalGains(setting: AccountTaxSetting, lotHoldingDays: number): number {
    if (setting.wrapper === 'PEA' && setting.accountOpenedDate) return daysSince(setting.accountOpenedDate);
    return lotHoldingDays;
}

/** Dividends aren't tied to one lot — without an account-opening date on file, default to "not yet exempt" (0 days) rather than silently assuming the 5-year benefit applies. */
function holdingDaysForDividends(setting: AccountTaxSetting): number {
    if (setting.wrapper === 'PEA' && setting.accountOpenedDate) return daysSince(setting.accountOpenedDate);
    return 0;
}

function applyRateOverride(rates: RatePair, income?: number, social?: number): RatePair {
    if (income === undefined && social === undefined) return rates;
    return {
        incomeRate: income ?? rates.incomeRate,
        socialRate: social ?? rates.socialRate,
        label: `${rates.label} (custom override applied)`,
    };
}

/**
 * The engine's suggested rates for this account — before any override. Used
 * to pre-fill the editable rate fields in the tax board.
 */
export function suggestedRates(residenceCountry: TaxResidenceCountry, setting: AccountTaxSetting, lotHoldingDays: number = 0): RateBreakdown {
    const cg = residenceRates(residenceCountry, setting.wrapper, holdingDaysForCapitalGains(setting, lotHoldingDays));
    const div = residenceRates(residenceCountry, setting.wrapper, holdingDaysForDividends(setting));
    const divSrc = dividendSourceRate(setting.country, setting.treatyFormOnFile);
    return {
        capitalGains: { incomeRate: cg.incomeRate, socialRate: cg.socialRate, sourceRate: CAPITAL_GAINS_SOURCE.rate, residenceLabel: cg.label, sourceLabel: CAPITAL_GAINS_SOURCE.label },
        dividends: { incomeRate: div.incomeRate, socialRate: div.socialRate, sourceRate: divSrc.rate, residenceLabel: div.label, sourceLabel: divSrc.label },
    };
}

/** Suggested rates with the account's overrides applied on top — what's actually used to compute tax. */
export function effectiveRates(residenceCountry: TaxResidenceCountry, setting: AccountTaxSetting, lotHoldingDays: number = 0): RateBreakdown {
    const suggested = suggestedRates(residenceCountry, setting, lotHoldingDays);
    const ov = setting.overrides ?? {};

    const cgResidence = applyRateOverride(
        { incomeRate: suggested.capitalGains.incomeRate, socialRate: suggested.capitalGains.socialRate, label: suggested.capitalGains.residenceLabel },
        ov.capitalGainsIncomeRate, ov.capitalGainsSocialRate,
    );
    const divResidence = applyRateOverride(
        { incomeRate: suggested.dividends.incomeRate, socialRate: suggested.dividends.socialRate, label: suggested.dividends.residenceLabel },
        ov.dividendIncomeRate, ov.dividendSocialRate,
    );

    return {
        capitalGains: {
            incomeRate: cgResidence.incomeRate, socialRate: cgResidence.socialRate,
            sourceRate: ov.capitalGainsSourceRate ?? suggested.capitalGains.sourceRate,
            residenceLabel: cgResidence.label,
            sourceLabel: ov.capitalGainsSourceRate !== undefined ? `Custom override: ${(ov.capitalGainsSourceRate * 100).toFixed(2)}%` : suggested.capitalGains.sourceLabel,
        },
        dividends: {
            incomeRate: divResidence.incomeRate, socialRate: divResidence.socialRate,
            sourceRate: ov.dividendSourceRate ?? suggested.dividends.sourceRate,
            residenceLabel: divResidence.label,
            sourceLabel: ov.dividendSourceRate !== undefined ? `Custom override: ${(ov.dividendSourceRate * 100).toFixed(2)}%` : suggested.dividends.sourceLabel,
        },
    };
}

function computeTax(amount: number, leg: RateLeg): TaxBreakdown {
    if (amount <= 0) {
        return { incomeTax: 0, socialTax: 0, sourceTax: 0, credit: 0, totalTax: 0, effectiveRate: 0, residenceLabel: 'No gain — no tax owed', sourceLabel: '' };
    }
    const incomeTax = amount * leg.incomeRate;
    const socialTax = amount * leg.socialRate;
    const sourceTax = amount * leg.sourceRate;
    const credit = Math.min(sourceTax, incomeTax);
    const totalTax = (incomeTax - credit) + socialTax + sourceTax;
    return { incomeTax, socialTax, sourceTax, credit, totalTax, effectiveRate: totalTax / amount, residenceLabel: leg.residenceLabel, sourceLabel: leg.sourceLabel };
}

export function estimateCapitalGainsTax(params: {
    /** Gain, in JPY — the taxpayer's reporting currency, not the display base currency. */
    gain: number;
    holdingDays: number;
    residenceCountry: TaxResidenceCountry | null;
    setting: AccountTaxSetting;
}): TaxBreakdown | null {
    const { gain, holdingDays, residenceCountry, setting } = params;
    if (residenceCountry === null || setting.wrapper === 'NONE') return null;
    return computeTax(gain, effectiveRates(residenceCountry, setting, holdingDays).capitalGains);
}

export function estimateDividendTax(params: {
    /** Dividend income, in JPY. */
    dividendIncome: number;
    residenceCountry: TaxResidenceCountry | null;
    setting: AccountTaxSetting;
}): TaxBreakdown | null {
    const { dividendIncome, residenceCountry, setting } = params;
    if (residenceCountry === null || setting.wrapper === 'NONE') return null;
    return computeTax(dividendIncome, effectiveRates(residenceCountry, setting).dividends);
}

/**
 * Stable per-lot key, shared between the display-currency Position list and
 * a parallel JPY-forced one, so a JPY-denominated gain computed separately
 * can be matched back to the row that needs it. txBuyIndex alone isn't
 * unique — one buy can be split across several sells — so it's paired with
 * txSellIndex (or 'open' for an unsold lot).
 */
export function taxLotKey(position: Pick<Position, 'txBuyIndex' | 'txSellIndex'>): string {
    return `${position.txBuyIndex ?? ''}::${position.txSellIndex ?? 'open'}`;
}
