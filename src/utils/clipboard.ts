/**
 * Copy text to the clipboard, with a fallback for browsers that refuse the
 * async Clipboard API.
 *
 * `navigator.clipboard.writeText` is the right call, but it is denied more
 * often than you'd expect: an insecure origin, a browser-level permission the
 * user has turned off, or a privacy-hardened profile all reject it — and the
 * rejection looks identical to a bug from the user's side. The legacy
 * `execCommand('copy')` path still works in every one of those cases, because
 * it copies from a real selection inside a trusted event rather than asking
 * for a permission.
 *
 * Returns whether the text made it to the clipboard, so the caller can show an
 * honest message either way.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            // Permission denied or insecure origin — fall through.
        }
    }
    return legacyCopy(text);
}

/**
 * Select-and-copy via a throwaway textarea.
 *
 * The element has to be in the document and focusable for the selection to
 * take, so it's positioned off-screen rather than hidden — `display: none`
 * and `visibility: hidden` both make it unselectable. `readOnly` stops mobile
 * Safari opening the keyboard on focus.
 */
function legacyCopy(text: string): boolean {
    if (typeof document === 'undefined') return false;

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.opacity = '0';

    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.appendChild(textarea);

    try {
        textarea.select();
        textarea.setSelectionRange(0, text.length);
        return document.execCommand('copy');
    } catch {
        return false;
    } finally {
        document.body.removeChild(textarea);
        // Returning focus keeps the keyboard-navigation position intact.
        previouslyFocused?.focus?.();
    }
}
