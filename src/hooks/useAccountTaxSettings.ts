'use client';

import { useState, useCallback, useEffect } from 'react';
import { AccountTaxSetting, DEFAULT_ACCOUNT_TAX_SETTING } from '@portfolio/core';

export type AccountTaxSettings = Record<string, AccountTaxSetting>;

export const ACCOUNT_TAX_SETTINGS_STORAGE_KEY = 'accountTaxSettingsV2';
const STORAGE_KEY = ACCOUNT_TAX_SETTINGS_STORAGE_KEY;
/** Superseded keys from earlier iterations of this feature — read once as a fallback, never written. */
const LEGACY_STORAGE_KEYS = ['accountTaxSettings', 'accountTaxProfiles'];

function readStored(): AccountTaxSettings {
    if (typeof window === 'undefined') return {};
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw) as AccountTaxSettings;
        // Fall back to an older shape that only had `wrapper` — everything else defaults in.
        for (const key of LEGACY_STORAGE_KEYS) {
            const legacyRaw = localStorage.getItem(key);
            if (!legacyRaw) continue;
            const parsed = JSON.parse(legacyRaw) as Record<string, { wrapper?: string }>;
            const result: AccountTaxSettings = {};
            for (const [account, value] of Object.entries(parsed)) {
                if (value?.wrapper) result[account] = { ...DEFAULT_ACCOUNT_TAX_SETTING, wrapper: value.wrapper as AccountTaxSetting['wrapper'] };
            }
            return result;
        }
        return {};
    } catch {
        return {};
    }
}

/** Per-account tax setup (home country, wrapper, treaty toggle, overrides), persisted locally. */
export function useAccountTaxSettings() {
    const [settings, setSettings] = useState<AccountTaxSettings>({});
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        setSettings(readStored());
        setHydrated(true);
    }, []);

    const setAccountSetting = useCallback((account: string, setting: AccountTaxSetting) => {
        setSettings(prev => {
            const next = { ...prev, [account]: setting };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            return next;
        });
    }, []);

    const updateAccountSetting = useCallback((account: string, patch: Partial<AccountTaxSetting>) => {
        setSettings(prev => {
            const current = prev[account] ?? DEFAULT_ACCOUNT_TAX_SETTING;
            const next = { ...prev, [account]: { ...current, ...patch } };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            return next;
        });
    }, []);

    const getSetting = useCallback((account: string): AccountTaxSetting => {
        return settings[account] ?? DEFAULT_ACCOUNT_TAX_SETTING;
    }, [settings]);

    return { settings, getSetting, setAccountSetting, updateAccountSetting, hydrated };
}
