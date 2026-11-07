import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AiAssistant, useOptionalAiAssistant } from '../../src/components/ai/AiAssistant';
import { LanguageProvider } from '../../src/i18n';

const mockPathname = jest.fn(() => '/');
jest.mock('next/navigation', () => ({ usePathname: () => mockPathname(), useRouter: () => ({ push: jest.fn() }) }));

const brief = { snapshot: { holdings: [] }, markdown: '# Portfolio brief' };
const mockBrief = jest.fn();
jest.mock('../../src/components/ai/usePortfolioBrief', () => ({
    usePortfolioBrief: (...args: unknown[]) => mockBrief(...args),
}));
const mockCopy = jest.fn(async () => true);
jest.mock('../../src/utils/clipboard', () => ({ copyToClipboard: (...a: unknown[]) => mockCopy(...(a as [])) }));
jest.mock('../../src/utils/localPositions', () => ({ getActiveSetId: () => 'set1' }));

const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const fetchMock = jest.fn();
beforeEach(() => {
    localStorage.clear();
    mockPathname.mockReturnValue('/');
    mockCopy.mockClear();
    mockBrief.mockReturnValue({ getBrief: () => brief, setId: 'set1', loaded: true, hasPositions: true });
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) => {
        if (String(url).startsWith('/api/chat')) return json({ enabled: true, signedIn: true, remaining: 20 });
        if (String(url).startsWith('/api/share')) return json({ active: true, expiresAt: '2027-01-01', updatedAt: 'x' });
        return json({});
    });
    global.fetch = fetchMock as unknown as typeof fetch;
});

const OpenFromElsewhere = () => {
    const ai = useOptionalAiAssistant();
    return <button onClick={() => ai?.open('own')}>settings-row</button>;
};

const mount = () => render(
    <LanguageProvider>
        <AiAssistant><OpenFromElsewhere /></AiAssistant>
    </LanguageProvider>,
);

describe('AiAssistant', () => {
    it('shows one launcher and loads nothing until it is opened', () => {
        mount();
        expect(screen.getByRole('button', { name: 'Open AI assistant' })).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(mockBrief).toHaveBeenLastCalledWith(false, 0);
    });

    it('opens on the Ask tab and switches to the own-AI tab', async () => {
        mount();
        fireEvent.click(screen.getByRole('button', { name: 'Open AI assistant' }));
        expect(await screen.findByRole('dialog', { name: 'AI' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /Ask here/ })).toHaveAttribute('aria-selected', 'true');
        fireEvent.click(screen.getByRole('tab', { name: /Use my own AI/ }));
        expect(screen.getByRole('tab', { name: /Use my own AI/ })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('button', { name: 'Copy summary' })).toBeInTheDocument();
    });

    it('can be opened on a given tab from elsewhere, e.g. Settings', async () => {
        mount();
        fireEvent.click(screen.getByText('settings-row'));
        expect(await screen.findByRole('tab', { name: /Use my own AI/ })).toHaveAttribute('aria-selected', 'true');
    });

    it('copies the summary to the clipboard', async () => {
        mount();
        fireEvent.click(screen.getByText('settings-row'));
        fireEvent.click(await screen.findByRole('button', { name: 'Copy summary' }));
        await waitFor(() => expect(mockCopy).toHaveBeenCalledWith('# Portfolio brief'));
        expect(await screen.findByText('Copied')).toBeInTheDocument();
    });

    it('reports a failed copy', async () => {
        mockCopy.mockResolvedValueOnce(false);
        mount();
        fireEvent.click(screen.getByText('settings-row'));
        fireEvent.click(await screen.findByRole('button', { name: 'Copy summary' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Could not copy');
    });

    it('marks the launcher as connected when a live share exists', async () => {
        localStorage.setItem('pt_ai_token_set1', 'tok');
        mount();
        expect(await screen.findByTitle('Connected')).toBeInTheDocument();
    });

    it('refreshes an existing connection once when the tab is opened', async () => {
        localStorage.setItem('pt_ai_token_set1', 'tok');
        mount();
        await act(async () => { fireEvent.click(screen.getByText('settings-row')); });
        await waitFor(() => {
            const posts = fetchMock.mock.calls.filter(([u, init]) => String(u) === '/api/share' && init?.method === 'POST');
            expect(posts).toHaveLength(1);
        });
    });

    it('is hidden on sign-in pages', () => {
        mockPathname.mockReturnValue('/auth/verify');
        mount();
        expect(screen.queryByRole('button', { name: 'Open AI assistant' })).toBeNull();
    });
});
