/**
 * Core i18n types.
 *
 * The English catalog (`src/i18n/en.ts`) is the single source of truth: its key
 * set defines `TranslationKey`, and every other locale is typed as
 * `Translations`, so TypeScript fails the build if a locale is missing a key or
 * invents one. Adding a string is therefore a two-file change by construction.
 */

import type { en } from './en';

/** Locales the UI ships with. */
export type Language = 'en' | 'fr';

/** Every key present in the English catalog. */
export type TranslationKey = keyof typeof en;

/** A complete catalog for one locale — same keys as English, no more, no less. */
export type Translations = Record<TranslationKey, string>;

/** Values substituted into `{placeholder}` slots inside a translated string. */
export type TranslationParams = Record<string, string | number>;

/** Metadata for the language picker. */
export interface LanguageOption {
    code: Language;
    /** Name written in that language itself — never translated. */
    label: string;
    /** BCP 47 tag used for Intl number/date formatting. */
    locale: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
    { code: 'en', label: 'English', locale: 'en-US' },
    { code: 'fr', label: 'Français', locale: 'fr-FR' },
];

export const DEFAULT_LANGUAGE: Language = 'en';

export function isLanguage(value: unknown): value is Language {
    return SUPPORTED_LANGUAGES.some(l => l.code === value);
}

/** BCP 47 tag for a language, used by Intl formatters. */
export function localeTag(language: Language): string {
    return SUPPORTED_LANGUAGES.find(l => l.code === language)?.locale ?? 'en-US';
}
