import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RichText } from '../../src/components/chat/RichText';
import { AiActionRegistryContext, createAiActionRegistry, type AiAction } from '../../src/components/ai/aiActions';
import { LanguageProvider } from '../../src/i18n';

const block = (spec: object) => `Here you go.\n\n\`\`\`action\n${JSON.stringify(spec)}\n\`\`\`\n`;

const setup = (action: Partial<AiAction> | null, text: string) => {
    const onRan = jest.fn();
    const registry = createAiActionRegistry(onRan);
    const run = jest.fn(async () => undefined);
    if (action) registry.register('page', () => [{ id: 'refresh_pinned', label: 'Refresh 12 pinned stocks', description: 'd', run, ...action } as AiAction]);
    render(
        <LanguageProvider>
            <AiActionRegistryContext.Provider value={registry}><RichText text={text} /></AiActionRegistryContext.Provider>
        </LanguageProvider>,
    );
    return { run, onRan, registry };
};

describe('ActionCard', () => {
    it('shows the page\'s own label and waits for a click: nothing runs on its own', () => {
        const { run } = setup({ detail: 'Fetches fresh quotes.' }, block({ id: 'refresh_pinned' }));
        expect(screen.getByText('Refresh 12 pinned stocks')).toBeInTheDocument();
        expect(screen.getByText('Fetches fresh quotes.')).toBeInTheDocument();
        expect(run).not.toHaveBeenCalled();
    });

    it('shows the model\'s reason in place of the generic detail', () => {
        setup({ detail: 'generic' }, block({ id: 'refresh_pinned', reason: 'Your prices are from last week' }));
        expect(screen.getByText('Your prices are from last week')).toBeInTheDocument();
        expect(screen.queryByText('generic')).toBeNull();
    });

    it('runs on click, reports done and tells the assistant data may have changed', async () => {
        const { run, onRan } = setup({}, block({ id: 'refresh_pinned' }));
        fireEvent.click(screen.getByRole('button', { name: 'Run' }));
        await waitFor(() => expect(screen.getByText('Done')).toBeInTheDocument());
        expect(run).toHaveBeenCalledTimes(1);
        expect(onRan).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('button', { name: 'Run' })).toBeNull();
    });

    it('says "started" for work that continues on the page', async () => {
        setup({ run: () => 'started' }, block({ id: 'refresh_pinned' }));
        fireEvent.click(screen.getByRole('button', { name: 'Run' }));
        expect(await screen.findByText(/Started/)).toBeInTheDocument();
    });

    it('reports a failure and lets the user try again', async () => {
        const { onRan } = setup({ run: async () => { throw new Error('boom'); } }, block({ id: 'refresh_pinned' }));
        fireEvent.click(screen.getByRole('button', { name: 'Run' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Could not complete it');
        expect(onRan).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled();
    });

    it('can be dismissed without running', () => {
        const { run } = setup({}, block({ id: 'refresh_pinned' }));
        fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
        expect(screen.queryByText('Refresh 12 pinned stocks')).toBeNull();
        expect(run).not.toHaveBeenCalled();
    });

    it('cannot run a disabled action', () => {
        const { run } = setup({ disabled: true }, block({ id: 'refresh_pinned' }));
        expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled();
        expect(run).not.toHaveBeenCalled();
    });

    it('never turns an id the page does not offer into a button', () => {
        const { run } = setup({}, block({ id: 'delete_everything' }));
        expect(screen.getByText(/isn’t available on this page/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Run' })).toBeNull();
        expect(run).not.toHaveBeenCalled();
    });

    it('draws nothing for an invalid or half-streamed block', () => {
        setup({}, '```action\n{"id":"refresh_pinned"');
        expect(screen.queryByText('Refresh 12 pinned stocks')).toBeNull();
    });
});
