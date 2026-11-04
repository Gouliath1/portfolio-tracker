/**
 * Turns a chat answer into a small, safe tree the UI can render.
 *
 * The model's text is untrusted: the portfolio brief it reads is data, and a
 * name inside it could try to steer the answer. So there is no raw HTML, no
 * images, and links are limited to this app and to Yahoo quote pages. Anything
 * else is shown as plain text. Only the handful of Markdown features the chat
 * prompt asks for are understood.
 *
 * Pure functions, so the safety rules are unit-tested rather than trusted.
 */

// ── Links ───────────────────────────────────────────────────────────────────

const APP_PATHS = new Set(['/', '/returns/deep-dive', '/screener', '/taxes', '/about']);
const APP_VIEWS = new Set(['overview', 'assets', 'data']);
const EXTERNAL_HOSTS = new Set(['finance.yahoo.com']);

export interface SafeHref { href: string; external: boolean }

/** The link as it should be rendered, or null when it must not be a link. */
export function sanitizeHref(raw: string): SafeHref | null {
    const value = raw.trim();
    if (!value || /[\u0000-\u001f\s]/.test(value)) return null;

    // A leading slash means "this app" — but `//host` is another site.
    if (value.startsWith('/') && !value.startsWith('//')) {
        let url: URL;
        try { url = new URL(value, 'http://app.invalid'); } catch { return null; }
        if (url.origin !== 'http://app.invalid' || !APP_PATHS.has(url.pathname)) return null;
        const view = url.searchParams.get('view');
        if (view !== null && !(url.pathname === '/' && APP_VIEWS.has(view))) return null;
        return { href: url.pathname + (view ? `?view=${view}` : ''), external: false };
    }

    let url: URL;
    try { url = new URL(value); } catch { return null; }
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (!EXTERNAL_HOSTS.has(url.hostname) || !url.pathname.startsWith('/quote/')) return null;
    return { href: url.toString(), external: true };
}

// ── Inline ──────────────────────────────────────────────────────────────────

export type Tone = 'pos' | 'neg';

export type Inline =
    | { t: 'text'; v: string; tone?: Tone }
    | { t: 'bold'; c: Inline[] }
    | { t: 'em'; c: Inline[] }
    | { t: 'code'; v: string }
    | { t: 'link'; v: string; href: string; external: boolean };

/**
 * A signed figure such as +4.2%, −$1,200 or -3. Only counted when it stands
 * alone (start, space or an opening bracket before it), so ranges like
 * "2020-2021" and tickers like "AAPL-B" are left alone.
 */
const SIGNED = /([+−-])([$€£¥]?\d[\d.,]*%?)/g;

function withTones(text: string): Inline[] {
    const out: Inline[] = [];
    let last = 0;
    for (const m of text.matchAll(SIGNED)) {
        const at = m.index ?? 0;
        const before = at === 0 ? ' ' : text[at - 1];
        if (!/[\s(]/.test(before)) continue;
        if (at > last) out.push({ t: 'text', v: text.slice(last, at) });
        out.push({ t: 'text', v: m[0], tone: m[1] === '+' ? 'pos' : 'neg' });
        last = at + m[0].length;
    }
    if (last < text.length) out.push({ t: 'text', v: text.slice(last) });
    return out;
}

const INLINE_PATTERNS: { kind: 'code' | 'bold' | 'link' | 'em'; re: RegExp }[] = [
    { kind: 'code', re: /`([^`\n]+)`/ },
    { kind: 'bold', re: /\*\*([^\n]+?)\*\*/ },
    { kind: 'link', re: /\[([^\]\n]+)\]\(([^)\s]+)\)/ },
    { kind: 'em', re: /\*([^*\s][^*\n]*?)\*/ },
];

export function parseInline(text: string): Inline[] {
    const out: Inline[] = [];
    let rest = text;
    while (rest) {
        let best: { kind: (typeof INLINE_PATTERNS)[number]['kind']; m: RegExpExecArray } | null = null;
        for (const { kind, re } of INLINE_PATTERNS) {
            const m = re.exec(rest);
            if (m && (!best || m.index < best.m.index)) best = { kind, m };
        }
        if (!best) { out.push(...withTones(rest)); break; }

        const { kind, m } = best;
        if (m.index > 0) out.push(...withTones(rest.slice(0, m.index)));
        if (kind === 'code') out.push({ t: 'code', v: m[1] });
        else if (kind === 'bold') out.push({ t: 'bold', c: parseInline(m[1]) });
        else if (kind === 'em') out.push({ t: 'em', c: parseInline(m[1]) });
        else {
            const safe = sanitizeHref(m[2]);
            if (safe) out.push({ t: 'link', v: m[1], ...safe });
            else out.push(...withTones(m[1]));
        }
        rest = rest.slice(m.index + m[0].length);
    }
    return out;
}

// ── Blocks ──────────────────────────────────────────────────────────────────

export type Block =
    | { t: 'p'; c: Inline[] }
    | { t: 'heading'; c: Inline[] }
    | { t: 'ul' | 'ol'; items: Inline[][] }
    | { t: 'table'; head: Inline[][]; rows: Inline[][][] }
    | { t: 'code'; v: string }
    /** `complete` is false while the closing fence has not streamed in yet. */
    | { t: 'chart'; raw: string; complete: boolean };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^#{1,6}\s+(.*)$/;
const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

const isTableRow = (line: string) => line.trim().startsWith('|');
const cells = (line: string) =>
    line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => parseInline(c.trim()));

export function parseBlocks(text: string): Block[] {
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const blocks: Block[] = [];
    let para: string[] = [];

    const flush = () => {
        if (para.length) blocks.push({ t: 'p', c: parseInline(para.join('\n')) });
        para = [];
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        const fence = /^\s*```\s*([\w-]*)\s*$/.exec(line);
        if (fence) {
            flush();
            const body: string[] = [];
            let closed = false;
            for (i++; i < lines.length; i++) {
                if (/^\s*```\s*$/.test(lines[i])) { closed = true; break; }
                body.push(lines[i]);
            }
            blocks.push(fence[1].toLowerCase() === 'chart'
                ? { t: 'chart', raw: body.join('\n'), complete: closed }
                : { t: 'code', v: body.join('\n') });
            continue;
        }

        if (line.trim() === '') { flush(); continue; }

        const heading = HEADING.exec(line);
        if (heading) { flush(); blocks.push({ t: 'heading', c: parseInline(heading[1]) }); continue; }

        if (isTableRow(line) && i + 1 < lines.length && TABLE_RULE.test(lines[i + 1]) && isTableRow(lines[i + 1])) {
            flush();
            const head = cells(line);
            const rows: Inline[][][] = [];
            for (i += 2; i < lines.length && isTableRow(lines[i]); i++) rows.push(cells(lines[i]));
            i--;
            blocks.push({ t: 'table', head, rows });
            continue;
        }

        const listKind = BULLET.test(line) ? 'ul' : NUMBERED.test(line) ? 'ol' : null;
        if (listKind) {
            flush();
            const re = listKind === 'ul' ? BULLET : NUMBERED;
            const items: Inline[][] = [];
            for (; i < lines.length; i++) {
                const m = re.exec(lines[i]);
                if (!m) break;
                items.push(parseInline(m[1]));
            }
            i--;
            blocks.push({ t: listKind, items });
            continue;
        }

        para.push(line);
    }
    flush();
    return blocks;
}

// ── Charts ──────────────────────────────────────────────────────────────────

export interface ChartDatum { label: string; value: number }

export interface ChartSpec {
    type: 'bar' | 'donut';
    title: string | null;
    /** Appended to values: "%" sits right after the number, anything else after a space. */
    unit: string;
    data: ChartDatum[];
}

export const MAX_CHART_POINTS = 12;

/**
 * Validates the JSON the model puts in a ```chart block. Strict on purpose: a
 * chart that can't be trusted is dropped, not guessed at.
 */
export function parseChartSpec(raw: string): ChartSpec | null {
    let json: unknown;
    try { json = JSON.parse(raw); } catch { return null; }
    if (typeof json !== 'object' || json === null) return null;
    const { type, title, unit, data } = json as Record<string, unknown>;

    if (type !== 'bar' && type !== 'donut') return null;
    if (!Array.isArray(data) || data.length < 2 || data.length > MAX_CHART_POINTS) return null;

    const points: ChartDatum[] = [];
    for (const d of data) {
        const p = d as Partial<ChartDatum> | null;
        if (!p || typeof p.label !== 'string' || typeof p.value !== 'number' || !Number.isFinite(p.value)) return null;
        const label = p.label.trim().slice(0, 40);
        if (!label) return null;
        points.push({ label, value: p.value });
    }
    // A donut shows shares of a whole, which negative values cannot be.
    if (type === 'donut' && (points.some(p => p.value < 0) || points.every(p => p.value === 0))) return null;

    return {
        type,
        title: typeof title === 'string' && title.trim() ? title.trim().slice(0, 80) : null,
        unit: typeof unit === 'string' ? unit.trim().slice(0, 6) : '',
        data: points,
    };
}

/** "12.3%" / "¥1.2M" style value, compact when large. */
export function formatChartValue(value: number, unit: string, locale = 'en'): string {
    const abs = Math.abs(value);
    const text = abs >= 10_000
        ? new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value)
        : new Intl.NumberFormat(locale, { maximumFractionDigits: abs < 10 ? 2 : 1 }).format(value);
    if (!unit) return text;
    return unit === '%' ? `${text}%` : `${text} ${unit}`;
}

/** A cell that is a figure (12,400 · +4.2% · ¥1.2M · 500 JPY), not a name like 7203.T. */
export const isNumericText = (text: string): boolean =>
    /^[+\u2212-]?[$€£¥]?\d[\d.,]*\s?(%|[kKMB]|[A-Z]{3})?$/.test(text.trim());
