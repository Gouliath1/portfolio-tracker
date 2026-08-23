'use client';

/**
 * Language context.
 *
 * Mirrors the shape of `useBaseCurrency`: the choice lives in localStorage, is
 * read after mount to keep server and client markup identical, and falls back
 * to the browser's `navigator.languages` on first visit.
 *
 * `hydrated` is false for the first client render (English, matching SSR) and
 * flips to true once the stored preference is applied. Components that must not
 * flash the wrong language can gate on it; most can ignore it, because the
 * swap happens in the same commit as the rest of the client-only state.
 */

import {
    createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import { en } from './en';
import { fr } from './fr';
import {
    DEFAULT_LANGUAGE, isLanguage, localeTag,
    type Language, type TranslationKey, type TranslationParams, type Translations,
} from './types';

const CATALOGS: Record<Language, Translations> = { en, fr };

const STORAGE_KEY = 'language';

/** Fires on `setLanguage` so non-React listeners (if any) can react. */
export const LANGUAGE_CHANGE_EVENT = 'portfolio-language-change';

/**
 * Substitute `{name}` placeholders. Unknown placeholders are left untouched so
 * a typo shows up in the UI as `{typo}` rather than silently disappearing.
 */
export function interpolate(template: string, params?: TranslationParams): string {
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in params ? String(params[name]) : match
    );
}

/**
 * Look up a key in one locale, falling back to English when a locale is
 * incomplete. The types make that impossible today, but the fallback keeps a
 * hand-edited catalog from rendering a blank label.
 */
export function translate(
    language: Language,
    key: TranslationKey,
    params?: TranslationParams
): string {
    const catalog = CATALOGS[language] ?? en;
    const template = catalog[key] ?? en[key] ?? key;
    return interpolate(template, params);
}

/** Best guess from the browser, used only when nothing is stored yet. */
export function detectBrowserLanguage(): Language {
    if (typeof navigator === 'undefined') return DEFAULT_LANGUAGE;
    const locales = [...(navigator.languages ?? []), navigator.language].filter(Boolean);
    for (const loc of locales) {
        const base = String(loc).toLowerCase().split('-')[0];
        if (isLanguage(base)) return base;
    }
    return DEFAULT_LANGUAGE;
}

export function readStoredLanguage(): Language {
    if (typeof window === 'undefined') return DEFAULT_LANGUAGE;
    try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (isLanguage(stored)) return stored;
    } catch {
        // private mode / storage disabled — fall through to detection
    }
    return detectBrowserLanguage();
}

export interface LanguageContextValue {
    language: Language;
    setLanguage: (next: Language) => void;
    /** Translate a key, interpolating `{placeholders}`. */
    t: (key: TranslationKey, params?: TranslationParams) => string;
    /** BCP 47 tag for the active language, for Intl formatters. */
    locale: string;
    /** True once the stored preference has been applied on the client. */
    hydrated: boolean;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
    const [language, setLanguageState] = useState<Language>(DEFAULT_LANGUAGE);
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        setLanguageState(readStoredLanguage());
        setHydrated(true);
    }, []);

    // Keep <html lang> in sync so screen readers and browser translation
    // prompts see the language the user actually picked.
    useEffect(() => {
        if (typeof document !== 'undefined') {
            document.documentElement.lang = language;
        }
    }, [language]);

    const setLanguage = useCallback((next: Language) => {
        try {
            window.localStorage.setItem(STORAGE_KEY, next);
        } catch {
            // preference simply won't persist
        }
        setLanguageState(next);
        window.dispatchEvent(new CustomEvent(LANGUAGE_CHANGE_EVENT, { detail: next }));
    }, []);

    const value = useMemo<LanguageContextValue>(() => ({
        language,
        setLanguage,
        t: (key, params) => translate(language, key, params),
        locale: localeTag(language),
        hydrated,
    }), [language, setLanguage, hydrated]);

    return (
        <LanguageContext.Provider value={value}>
            {children}
        </LanguageContext.Provider>
    );
}

/**
 * Read the active language.
 *
 * Falls back to a standalone English context when no provider is mounted, so a
 * component can be unit-tested (or rendered inside a portal-less fixture)
 * without every test needing the provider.
 */
export function useLanguage(): LanguageContextValue {
    const ctx = useContext(LanguageContext);
    if (ctx) return ctx;
    return {
        language: DEFAULT_LANGUAGE,
        setLanguage: () => {},
        t: (key, params) => translate(DEFAULT_LANGUAGE, key, params),
        locale: localeTag(DEFAULT_LANGUAGE),
        hydrated: false,
    };
}

/** Sugar for the common case: `const { t } = useTranslation()`. */
export function useTranslation() {
    return useLanguage();
}
