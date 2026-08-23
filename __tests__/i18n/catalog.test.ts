/**
 * Catalog integrity tests.
 *
 * These guard the invariants that make a second language safe to ship:
 * every locale carries the same keys, the same `{placeholder}` slots, and no
 * accidentally-empty strings. TypeScript already enforces the key set at build
 * time (`fr` is typed as `Translations`), but these run in CI on the actual
 * values — which types cannot see — and produce a readable diff when a key is
 * added to English and forgotten in French.
 */

import { en } from '@/i18n/en';
import { fr } from '@/i18n/fr';
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE, isLanguage, localeTag } from '@/i18n/types';
import type { Language, TranslationKey } from '@/i18n/types';

const CATALOGS: Record<Language, Record<string, string>> = { en, fr };

/** Placeholder names inside a template, e.g. "{count} of {total}" → [count, total]. */
const placeholders = (template: string): string[] =>
    (template.match(/\{(\w+)\}/g) ?? []).sort();

describe('translation catalogs', () => {
    const enKeys = Object.keys(en) as TranslationKey[];

    it('ships every language declared in SUPPORTED_LANGUAGES', () => {
        for (const { code } of SUPPORTED_LANGUAGES) {
            expect(CATALOGS[code]).toBeDefined();
        }
    });

    it('English is the default language', () => {
        expect(DEFAULT_LANGUAGE).toBe('en');
        expect(CATALOGS[DEFAULT_LANGUAGE]).toBe(en);
    });

    it('has a non-trivial number of keys (catches an accidentally emptied catalog)', () => {
        expect(enKeys.length).toBeGreaterThan(200);
    });

    describe.each(SUPPORTED_LANGUAGES.filter(l => l.code !== 'en'))('$label ($code)', ({ code }) => {
        const catalog = CATALOGS[code];

        it('defines exactly the English key set — no missing keys', () => {
            const missing = enKeys.filter(k => !(k in catalog));
            expect(missing).toEqual([]);
        });

        it('defines no keys that English does not have', () => {
            const extra = Object.keys(catalog).filter(k => !(k in en));
            expect(extra).toEqual([]);
        });

        it('has no empty or whitespace-only translations', () => {
            const blank = Object.entries(catalog)
                .filter(([, value]) => value.trim() === '')
                .map(([key]) => key);
            expect(blank).toEqual([]);
        });

        it('keeps the same {placeholder} names as English for every key', () => {
            const mismatched = enKeys
                .filter(k => placeholders(en[k]).join(',') !== placeholders(catalog[k]).join(','))
                .map(k => `${k}: en=[${placeholders(en[k])}] ${code}=[${placeholders(catalog[k])}]`);
            expect(mismatched).toEqual([]);
        });

        it('actually translates — most strings differ from English', () => {
            // Some entries legitimately match English (ETF, XIRR, currency codes,
            // ratio abbreviations, "Notes"). A near-total match means the catalog
            // was never translated.
            const identical = enKeys.filter(k => en[k] === catalog[k]);
            expect(identical.length / enKeys.length).toBeLessThan(0.25);
        });
    });
});

describe('language helpers', () => {
    it('recognises supported language codes', () => {
        expect(isLanguage('en')).toBe(true);
        expect(isLanguage('fr')).toBe(true);
    });

    it('rejects anything else', () => {
        expect(isLanguage('de')).toBe(false);
        expect(isLanguage('')).toBe(false);
        expect(isLanguage(null)).toBe(false);
        expect(isLanguage(undefined)).toBe(false);
        expect(isLanguage(42)).toBe(false);
    });

    it('maps each language to a BCP 47 tag used by Intl', () => {
        expect(localeTag('en')).toBe('en-US');
        expect(localeTag('fr')).toBe('fr-FR');
    });

    it('formats numbers differently per locale — proving the tags are wired up', () => {
        const n = 1234.5;
        expect(n.toLocaleString(localeTag('en'))).not.toBe(n.toLocaleString(localeTag('fr')));
        expect(n.toLocaleString(localeTag('en'))).toBe('1,234.5');
    });
});
