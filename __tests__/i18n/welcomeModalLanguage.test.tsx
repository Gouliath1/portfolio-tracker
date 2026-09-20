/**
 * The first-run welcome modal must be escapable in your own language.
 *
 * A French speaker's very first contact with the app is this modal. If the
 * only language control lives behind the Settings drawer, they have to parse
 * English copy before they can switch — so the picker is inline here, and
 * these tests pin that behaviour down.
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import WelcomeModal from '@/components/layout/WelcomeModal';
import { LanguageProvider } from '@/i18n/LanguageProvider';
import { en } from '@/i18n/en';
import { fr } from '@/i18n/fr';

const ONBOARDED_KEY = 'pt_onboarded';

const renderModal = (onAddPosition = () => {}, onImport = () => {}) =>
    render(
        <LanguageProvider>
            <WelcomeModal onAddPosition={onAddPosition} onImport={onImport} />
        </LanguageProvider>
    );

beforeEach(() => {
    window.localStorage.clear();
});

describe('WelcomeModal — first-run language picker', () => {
    it('shows on a first visit', () => {
        renderModal();
        expect(screen.getByRole('heading', { name: en['welcome.title'] })).toBeInTheDocument();
    });

    it('stays hidden once the user has been onboarded', () => {
        window.localStorage.setItem(ONBOARDED_KEY, '1');
        renderModal();
        expect(screen.queryByRole('heading', { name: en['welcome.title'] })).not.toBeInTheDocument();
    });

    it('offers every supported language, labelled in its own language', () => {
        renderModal();

        expect(screen.getByRole('button', { name: 'English' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Français' })).toBeInTheDocument();
    });

    it('marks the active language as pressed', () => {
        renderModal();

        expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'Français' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('translates the whole modal in place when a language is picked', () => {
        renderModal();

        expect(screen.getByRole('heading', { name: en['welcome.title'] })).toBeInTheDocument();

        act(() => { fireEvent.click(screen.getByRole('button', { name: 'Français' })); });

        expect(screen.getByText(fr['welcome.primaryBody'])).toBeInTheDocument();
        expect(screen.getByText(fr['welcome.importLink'])).toBeInTheDocument();
        expect(screen.getByText(fr['welcome.localDataNote'])).toBeInTheDocument();
    });

    it('translates the call-to-action buttons too', () => {
        renderModal();
        act(() => { fireEvent.click(screen.getByRole('button', { name: 'Français' })); });

        expect(screen.getByRole('button', { name: new RegExp(fr['welcome.ctaPrimary'], 'i') })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: fr['welcome.ctaExplore'] })).toBeInTheDocument();
    });

    it('persists the choice, so the rest of the app opens in that language', () => {
        renderModal();

        act(() => { fireEvent.click(screen.getByRole('button', { name: 'Français' })); });

        expect(window.localStorage.getItem('language')).toBe('fr');
    });

    it('picking a language does not dismiss the modal', () => {
        renderModal();

        act(() => { fireEvent.click(screen.getByRole('button', { name: 'Français' })); });

        expect(screen.getByRole('button', { name: fr['welcome.ctaExplore'] })).toBeInTheDocument();
        expect(window.localStorage.getItem(ONBOARDED_KEY)).toBeNull();
    });

    it('the language picker is a labelled group, so it is reachable by assistive tech', () => {
        renderModal();

        const group = screen.getByRole('group', { name: en['settings.language'] });
        expect(group).toBeInTheDocument();
        expect(group).toContainElement(screen.getByRole('button', { name: 'Français' }));
    });

    it('still dismisses and triggers add-position from the primary CTA after switching language', () => {
        const onAddPosition = jest.fn();
        renderModal(onAddPosition);

        act(() => { fireEvent.click(screen.getByRole('button', { name: 'Français' })); });
        fireEvent.click(screen.getByRole('button', { name: new RegExp(fr['welcome.ctaPrimary'], 'i') }));

        expect(onAddPosition).toHaveBeenCalledTimes(1);
        expect(window.localStorage.getItem(ONBOARDED_KEY)).toBe('1');
    });

    it('still dismisses and triggers import from the import link after switching language', () => {
        const onImport = jest.fn();
        renderModal(() => {}, onImport);

        act(() => { fireEvent.click(screen.getByRole('button', { name: 'Français' })); });
        fireEvent.click(screen.getByRole('button', { name: fr['welcome.importLink'] }));

        expect(onImport).toHaveBeenCalledTimes(1);
        expect(window.localStorage.getItem(ONBOARDED_KEY)).toBe('1');
    });

    it('dismisses on "continue with the demo" without calling either handler', () => {
        const onAddPosition = jest.fn();
        const onImport = jest.fn();
        renderModal(onAddPosition, onImport);

        fireEvent.click(screen.getByRole('button', { name: en['welcome.ctaExplore'] }));

        expect(onAddPosition).not.toHaveBeenCalled();
        expect(onImport).not.toHaveBeenCalled();
        expect(window.localStorage.getItem(ONBOARDED_KEY)).toBe('1');
        expect(screen.queryByRole('heading', { name: en['welcome.title'] })).not.toBeInTheDocument();
    });
});
