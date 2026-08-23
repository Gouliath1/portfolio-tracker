/**
 * End-to-end language switching through a real component.
 *
 * `catalog.test.ts` proves the catalogs line up and `languageProvider.test.tsx`
 * proves the context works; this proves the two are actually wired into the UI —
 * that SettingsPanel reads its labels from the catalog rather than from
 * hard-coded English, and that the language picker changes them.
 */

import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { SettingsPanel } from '@/components/layout/SettingsPanel';
import { LanguageProvider } from '@/i18n/LanguageProvider';
import { en } from '@/i18n/en';
import { fr } from '@/i18n/fr';

jest.mock('next-themes', () => ({
    useTheme: () => ({ resolvedTheme: 'dark', setTheme: jest.fn() }),
}));

// The FX section fetches rates on open; keep it inert and silent.
jest.mock('@/components/layout/ExchangeRatesSection', () => ({
    ExchangeRatesSection: () => null,
}));

const renderPanel = () =>
    render(
        <LanguageProvider>
            <SettingsPanel open onClose={() => {}} currency="JPY" onCurrencyChange={() => {}} />
        </LanguageProvider>
    );

beforeEach(() => {
    window.localStorage.clear();
});

describe('SettingsPanel — language selection', () => {
    it('offers a button for each supported language, labelled in its own language', () => {
        renderPanel();

        expect(screen.getByRole('button', { name: 'English' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Français' })).toBeInTheDocument();
    });

    it('marks the active language as pressed', () => {
        renderPanel();

        expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'Français' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('renders its own labels in English by default', () => {
        renderPanel();

        expect(screen.getByRole('heading', { name: en['settings.title'] })).toBeInTheDocument();
        expect(screen.getByText(en['settings.baseCurrency'])).toBeInTheDocument();
        expect(screen.getByText(en['settings.language'])).toBeInTheDocument();
    });

    it('re-renders every label in French after picking Français', () => {
        renderPanel();

        act(() => { fireEvent.click(screen.getByRole('button', { name: 'Français' })); });

        expect(screen.getByRole('heading', { name: fr['settings.title'] })).toBeInTheDocument();
        expect(screen.getByText(fr['settings.baseCurrency'])).toBeInTheDocument();
        expect(screen.getByText(fr['settings.baseCurrencyHelp'])).toBeInTheDocument();
    });

    it('no longer shows the English labels once French is active', () => {
        renderPanel();

        act(() => { fireEvent.click(screen.getByRole('button', { name: 'Français' })); });

        // Only assert on labels whose French differs — identical ones (e.g. an
        // untranslated abbreviation) would be a false failure.
        for (const key of ['settings.baseCurrency', 'settings.baseCurrencyHelp'] as const) {
            if (en[key] !== fr[key]) {
                expect(screen.queryByText(en[key])).not.toBeInTheDocument();
            }
        }
    });

    it('flips the pressed state to the newly chosen language', () => {
        renderPanel();

        act(() => { fireEvent.click(screen.getByRole('button', { name: 'Français' })); });

        expect(screen.getByRole('button', { name: 'Français' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('persists the choice and restores it on the next render', () => {
        const { unmount } = renderPanel();
        act(() => { fireEvent.click(screen.getByRole('button', { name: 'Français' })); });
        unmount();

        renderPanel();

        expect(screen.getByRole('heading', { name: fr['settings.title'] })).toBeInTheDocument();
    });

    it('leaves currency codes and symbols untranslated — they are data, not copy', () => {
        renderPanel();
        act(() => { fireEvent.click(screen.getByRole('button', { name: 'Français' })); });

        for (const { code, symbol } of [
            { code: 'JPY', symbol: '¥' },
            { code: 'USD', symbol: '$' },
            { code: 'EUR', symbol: '€' },
            { code: 'GBP', symbol: '£' },
        ]) {
            const button = screen.getByText(code).closest('button')!;
            expect(within(button).getByText(symbol)).toBeInTheDocument();
        }
    });

    it('still fires onCurrencyChange with the ISO code while in French', () => {
        const onChange = jest.fn();
        render(
            <LanguageProvider>
                <SettingsPanel open onClose={() => {}} currency="JPY" onCurrencyChange={onChange} />
            </LanguageProvider>
        );

        act(() => { fireEvent.click(screen.getByRole('button', { name: 'Français' })); });
        fireEvent.click(screen.getByText('USD'));

        expect(onChange).toHaveBeenCalledWith('USD');
    });
});
