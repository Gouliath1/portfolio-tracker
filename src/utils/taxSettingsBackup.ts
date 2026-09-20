import type { TaxResidenceCountry } from '@portfolio/core';
import { TAX_RESIDENCE_STORAGE_KEY } from '../hooks/useTaxResidence';
import { ACCOUNT_TAX_SETTINGS_STORAGE_KEY, type AccountTaxSettings } from '../hooks/useAccountTaxSettings';

/**
 * Tax setup (residence + per-account wrappers/overrides) lives in its own
 * localStorage keys, outside the transactions a portfolio export otherwise
 * carries — so a plain position export/import would silently lose it.
 * Bundled into the same JSON file instead, under this key, so one export is
 * a complete backup.
 */
export interface TaxSettingsBackup {
    residenceCountry: TaxResidenceCountry | null;
    accountTaxSettings: AccountTaxSettings;
}

/** Reads the current tax setup for inclusion in a portfolio export. Returns undefined when nothing is configured, so an export with no tax setup stays a plain transactions array. */
export function readTaxSettingsForBackup(): TaxSettingsBackup | undefined {
    if (typeof window === 'undefined') return undefined;
    const residence = localStorage.getItem(TAX_RESIDENCE_STORAGE_KEY);
    const residenceCountry: TaxResidenceCountry | null = residence === 'FR' || residence === 'JP' ? residence : null;

    let accountTaxSettings: AccountTaxSettings = {};
    try {
        const raw = localStorage.getItem(ACCOUNT_TAX_SETTINGS_STORAGE_KEY);
        if (raw) accountTaxSettings = JSON.parse(raw) as AccountTaxSettings;
    } catch {
        accountTaxSettings = {};
    }

    if (residenceCountry === null && Object.keys(accountTaxSettings).length === 0) return undefined;
    return { residenceCountry, accountTaxSettings };
}

/**
 * Restores tax setup from an imported backup — residence is overwritten
 * (an imported backup is treated as authoritative for "who you are"), and
 * per-account settings are merged so importing a second portfolio set
 * doesn't wipe out an already-configured account from a different one.
 */
export function applyTaxSettingsFromBackup(backup: TaxSettingsBackup): void {
    if (typeof window === 'undefined') return;
    if (backup.residenceCountry) {
        localStorage.setItem(TAX_RESIDENCE_STORAGE_KEY, backup.residenceCountry);
    }

    let existing: AccountTaxSettings = {};
    try {
        const raw = localStorage.getItem(ACCOUNT_TAX_SETTINGS_STORAGE_KEY);
        if (raw) existing = JSON.parse(raw) as AccountTaxSettings;
    } catch {
        existing = {};
    }
    const merged = { ...existing, ...(backup.accountTaxSettings ?? {}) };
    localStorage.setItem(ACCOUNT_TAX_SETTINGS_STORAGE_KEY, JSON.stringify(merged));
}
