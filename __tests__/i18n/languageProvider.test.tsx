/**
 * LanguageProvider behaviour tests.
 *
 * Covers the four things the rest of the app relies on:
 *   1. `translate` / `interpolate` — key lookup and {placeholder} substitution.
 *   2. Persistence — the choice survives via localStorage, and a first visit
 *      falls back to the browser's languages.
 *   3. The React context — components read the active language, and switching
 *      re-renders them in the new one.
 *   4. The no-provider fallback — a component rendered outside the provider
 *      still gets English rather than throwing.
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import {
    LanguageProvider, useTranslation, translate, interpolate,
    detectBrowserLanguage, readStoredLanguage,
} from '@/i18n/LanguageProvider';
import { en } from '@/i18n/en';
import { fr } from '@/i18n/fr';

const STORAGE_KEY = 'language';

/** Replace navigator.languages for a test, returning a restore function. */
const withNavigatorLanguages = (languages: string[]) => {
    const original = Object.getOwnPropertyDescriptor(window.navigator, 'languages');
    Object.defineProperty(window.navigator, 'languages', {
        value: languages,
        configurable: true,
    });
    return () => {
        if (original) Object.defineProperty(window.navigator, 'languages', original);
    };
};

beforeEach(() => {
    window.localStorage.clear();
});

// ─── 1. Pure translation helpers ─────────────────────────────────────────────

describe('interpolate', () => {
    it('substitutes a named placeholder', () => {
        expect(interpolate('{count} lots', { count: 3 })).toBe('3 lots');
    });

    it('substitutes several placeholders, including repeats', () => {
        expect(interpolate('{a}-{b}-{a}', { a: 'x', b: 'y' })).toBe('x-y-x');
    });

    it('returns the template untouched when no params are given', () => {
        expect(interpolate('{count} lots')).toBe('{count} lots');
    });

    it('leaves an unknown placeholder visible rather than silently blanking it', () => {
        expect(interpolate('{known} and {unknown}', { known: 'a' })).toBe('a and {unknown}');
    });

    it('coerces numbers to strings', () => {
        expect(interpolate('{n}', { n: 0 })).toBe('0');
    });
});

describe('translate', () => {
    it('returns the English string for an English lookup', () => {
        expect(translate('en', 'common.cancel')).toBe(en['common.cancel']);
    });

    it('returns the French string for a French lookup', () => {
        expect(translate('fr', 'common.cancel')).toBe(fr['common.cancel']);
    });

    it('interpolates params into the localised template', () => {
        const result = translate('fr', 'sell.title', { ticker: 'AAPL' });
        expect(result).toContain('AAPL');
        expect(result).not.toContain('{ticker}');
    });

    it('falls back to English for an unknown language', () => {
        // Cast: the point is to prove a hand-edited/persisted bad value is survivable.
        expect(translate('de' as 'en', 'common.cancel')).toBe(en['common.cancel']);
    });
});

// ─── 2. Detection and persistence ────────────────────────────────────────────

describe('detectBrowserLanguage', () => {
    it('picks French when the browser prefers a French locale', () => {
        const restore = withNavigatorLanguages(['fr-FR', 'en-US']);
        expect(detectBrowserLanguage()).toBe('fr');
        restore();
    });

    it('picks the first supported language in preference order', () => {
        const restore = withNavigatorLanguages(['de-DE', 'fr-CA', 'en']);
        expect(detectBrowserLanguage()).toBe('fr');
        restore();
    });

    it('falls back to English when nothing matches', () => {
        const restore = withNavigatorLanguages(['de-DE', 'es-ES']);
        expect(detectBrowserLanguage()).toBe('en');
        restore();
    });
});

describe('readStoredLanguage', () => {
    it('returns the stored choice when it is valid', () => {
        window.localStorage.setItem(STORAGE_KEY, 'fr');
        expect(readStoredLanguage()).toBe('fr');
    });

    it('ignores an invalid stored value and falls back to detection', () => {
        window.localStorage.setItem(STORAGE_KEY, 'klingon');
        const restore = withNavigatorLanguages(['en-GB']);
        expect(readStoredLanguage()).toBe('en');
        restore();
    });

    it('detects from the browser when nothing is stored', () => {
        const restore = withNavigatorLanguages(['fr']);
        expect(readStoredLanguage()).toBe('fr');
        restore();
    });
});

// ─── 3. The context in a React tree ──────────────────────────────────────────

const Probe = () => {
    const { t, language, setLanguage } = useTranslation();
    return (
        <div>
            <span data-testid="lang">{language}</span>
            <span data-testid="label">{t('common.cancel')}</span>
            <span data-testid="interpolated">{t('sell.title', { ticker: 'AAPL' })}</span>
            <button onClick={() => setLanguage('fr')}>to-fr</button>
            <button onClick={() => setLanguage('en')}>to-en</button>
        </div>
    );
};

describe('LanguageProvider', () => {
    it('renders English by default when nothing is stored', () => {
        const restore = withNavigatorLanguages(['en-US']);
        render(<LanguageProvider><Probe /></LanguageProvider>);

        expect(screen.getByTestId('lang')).toHaveTextContent('en');
        expect(screen.getByTestId('label')).toHaveTextContent(en['common.cancel']);
        restore();
    });

    it('hydrates from localStorage on mount', () => {
        window.localStorage.setItem(STORAGE_KEY, 'fr');
        render(<LanguageProvider><Probe /></LanguageProvider>);

        expect(screen.getByTestId('lang')).toHaveTextContent('fr');
        expect(screen.getByTestId('label')).toHaveTextContent(fr['common.cancel']);
    });

    it('re-renders children in the new language when setLanguage is called', () => {
        const restore = withNavigatorLanguages(['en-US']);
        render(<LanguageProvider><Probe /></LanguageProvider>);

        expect(screen.getByTestId('label')).toHaveTextContent(en['common.cancel']);

        act(() => { fireEvent.click(screen.getByText('to-fr')); });

        expect(screen.getByTestId('lang')).toHaveTextContent('fr');
        expect(screen.getByTestId('label')).toHaveTextContent(fr['common.cancel']);
        restore();
    });

    it('persists the choice to localStorage so it survives a reload', () => {
        render(<LanguageProvider><Probe /></LanguageProvider>);

        act(() => { fireEvent.click(screen.getByText('to-fr')); });

        expect(window.localStorage.getItem(STORAGE_KEY)).toBe('fr');
    });

    it('switches back to English again', () => {
        window.localStorage.setItem(STORAGE_KEY, 'fr');
        render(<LanguageProvider><Probe /></LanguageProvider>);

        act(() => { fireEvent.click(screen.getByText('to-en')); });

        expect(screen.getByTestId('lang')).toHaveTextContent('en');
        expect(screen.getByTestId('label')).toHaveTextContent(en['common.cancel']);
    });

    it('interpolates params through the context translator', () => {
        window.localStorage.setItem(STORAGE_KEY, 'fr');
        render(<LanguageProvider><Probe /></LanguageProvider>);

        const text = screen.getByTestId('interpolated').textContent ?? '';
        expect(text).toContain('AAPL');
        expect(text).not.toContain('{ticker}');
    });

    it('keeps <html lang> in sync with the active language', () => {
        render(<LanguageProvider><Probe /></LanguageProvider>);

        act(() => { fireEvent.click(screen.getByText('to-fr')); });
        expect(document.documentElement.lang).toBe('fr');

        act(() => { fireEvent.click(screen.getByText('to-en')); });
        expect(document.documentElement.lang).toBe('en');
    });

    it('exposes a locale tag that follows the language', () => {
        window.localStorage.setItem(STORAGE_KEY, 'fr');
        const { result } = renderHook(() => useTranslation(), {
            wrapper: ({ children }) => <LanguageProvider>{children}</LanguageProvider>,
        });

        expect(result.current.locale).toBe('fr-FR');
    });
});

// ─── 4. Fallback outside a provider ──────────────────────────────────────────

describe('useTranslation without a provider', () => {
    it('falls back to English instead of throwing', () => {
        render(<Probe />);

        expect(screen.getByTestId('lang')).toHaveTextContent('en');
        expect(screen.getByTestId('label')).toHaveTextContent(en['common.cancel']);
    });

    it('reports hydrated=false so callers can tell it is the fallback', () => {
        const { result } = renderHook(() => useTranslation());
        expect(result.current.hydrated).toBe(false);
    });
});
