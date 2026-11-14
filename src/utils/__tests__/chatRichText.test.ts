/** @jest-environment node */
import {
    formatChartValue, isNumericText, parseActionSpec, parseBlocks, parseChartSpec, parseInline, sanitizeHref, MAX_ACTION_REASON_CHARS, MAX_CHART_POINTS,
} from '../chatRichText';

describe('sanitizeHref', () => {
    it.each([
        ['/screener', { href: '/screener', external: false }],
        ['/returns/deep-dive', { href: '/returns/deep-dive', external: false }],
        ['/?view=assets', { href: '/?view=assets', external: false }],
        ['https://finance.yahoo.com/quote/AAPL', { href: 'https://finance.yahoo.com/quote/AAPL', external: true }],
    ])('allows %s', (raw, expected) => {
        expect(sanitizeHref(raw)).toEqual(expected);
    });

    it.each([
        'javascript:alert(1)',
        'data:text/html,hi',
        '//evil.example/x',
        '/\\evil.example',
        '/unknown-page',
        '/?view=hacked',
        '/screener?view=assets',
        'http://finance.yahoo.com/quote/AAPL',
        'https://evil.example/quote/AAPL',
        'https://finance.yahoo.com.evil.example/quote/AAPL',
        'https://user:pw@finance.yahoo.com/quote/AAPL',
        'https://finance.yahoo.com/other',
        '',
        '/scree ner',
    ])('rejects %s', raw => {
        expect(sanitizeHref(raw)).toBeNull();
    });
});

describe('parseInline', () => {
    it('reads bold, italic, code and links', () => {
        expect(parseInline('a **b** *c* `d` [e](/about)')).toEqual([
            { t: 'text', v: 'a ' }, { t: 'bold', c: [{ t: 'text', v: 'b' }] },
            { t: 'text', v: ' ' }, { t: 'em', c: [{ t: 'text', v: 'c' }] },
            { t: 'text', v: ' ' }, { t: 'code', v: 'd' },
            { t: 'text', v: ' ' }, { t: 'link', v: 'e', href: '/about', external: false },
        ]);
    });

    it('shows an unsafe link as plain text, never as a link', () => {
        const out = parseInline('[click](javascript:alert(1))');
        expect(out.some(n => n.t === 'link')).toBe(false);
    });

    it('never produces markup from raw HTML or images', () => {
        const out = parseInline('<img src=x onerror=alert(1)> ![x](https://evil.example/a.png)');
        expect(out.every(n => n.t === 'text' || n.t === 'link')).toBe(true);
        expect(out.some(n => n.t === 'link')).toBe(false);
    });

    it('colours standalone signed figures only', () => {
        const tones = (s: string) => parseInline(s)
            .filter((n): n is Extract<typeof n, { t: 'text' }> => n.t === 'text' && !!n.tone)
            .map(n => [n.v, n.tone]);
        expect(tones('Gain +4.2% and loss -3.1%')).toEqual([['+4.2%', 'pos'], ['-3.1%', 'neg']]);
        expect(tones('Down (−$1,200) today')).toEqual([['−$1,200', 'neg']]);
        expect(tones('Held 2020-2021, ticker AAPL-3')).toEqual([]);
    });
});

describe('parseBlocks', () => {
    it('splits paragraphs, lists, headings and tables', () => {
        const blocks = parseBlocks([
            '## Summary', '', 'First line', 'second line', '',
            '- one', '- two', '', '1. a', '2) b', '',
            '| A | B |', '|---|:--:|', '| 1 | 2 |', '| 3 | 4 |',
        ].join('\n'));
        expect(blocks.map(b => b.t)).toEqual(['heading', 'p', 'ul', 'ol', 'table']);
        const table = blocks[4];
        if (table.t !== 'table') throw new Error('expected table');
        expect(table.head).toHaveLength(2);
        expect(table.rows).toHaveLength(2);
    });

    it('does not treat a lone pipe line as a table', () => {
        expect(parseBlocks('| not | a table').map(b => b.t)).toEqual(['p']);
    });

    it('marks a chart block incomplete until the fence closes', () => {
        const open = parseBlocks('Intro\n```chart\n{"type":"bar"');
        expect(open[1]).toEqual({ t: 'chart', raw: '{"type":"bar"', complete: false });
        const closed = parseBlocks('```chart\n{}\n```\nAfter');
        expect(closed.map(b => b.t)).toEqual(['chart', 'p']);
        expect(closed[0]).toMatchObject({ complete: true });
    });

    it('keeps other fenced code as text, not markup', () => {
        expect(parseBlocks('```js\n<b>x</b>\n```')).toEqual([{ t: 'code', v: '<b>x</b>' }]);
    });
});

describe('parseChartSpec', () => {
    const ok = { type: 'bar', title: 'Top', unit: '%', data: [{ label: 'A', value: 1 }, { label: 'B', value: -2 }] };

    it('accepts a valid bar chart with negatives', () => {
        expect(parseChartSpec(JSON.stringify(ok))).toEqual(ok);
    });

    it.each([
        ['not json', '{oops'],
        ['unknown type', JSON.stringify({ ...ok, type: 'pie' })],
        ['one point', JSON.stringify({ ...ok, data: [{ label: 'A', value: 1 }] })],
        ['non-numeric value', JSON.stringify({ ...ok, data: [{ label: 'A', value: '1' }, { label: 'B', value: 2 }] })],
        ['missing label', JSON.stringify({ ...ok, data: [{ value: 1 }, { label: 'B', value: 2 }] })],
        ['too many points', JSON.stringify({ ...ok, data: Array.from({ length: MAX_CHART_POINTS + 1 }, (_, i) => ({ label: `x${i}`, value: i })) })],
        ['negative donut', JSON.stringify({ ...ok, type: 'donut' })],
        ['all-zero donut', JSON.stringify({ type: 'donut', data: [{ label: 'A', value: 0 }, { label: 'B', value: 0 }] })],
    ])('rejects %s', (_name, raw) => {
        expect(parseChartSpec(raw)).toBeNull();
    });

    it('clips long text and defaults the optional fields', () => {
        const spec = parseChartSpec(JSON.stringify({
            type: 'donut', data: [{ label: 'x'.repeat(100), value: 1 }, { label: 'B', value: 2 }],
        }));
        expect(spec?.data[0].label).toHaveLength(40);
        expect(spec?.title).toBeNull();
        expect(spec?.unit).toBe('');
    });
});

describe('formatChartValue', () => {
    it('formats percents, units and large numbers compactly', () => {
        expect(formatChartValue(12.345, '%')).toBe('12.3%');
        expect(formatChartValue(5.5, 'JPY')).toBe('5.5 JPY');
        expect(formatChartValue(1_200_000, '')).toBe('1.2M');
        expect(formatChartValue(-3, '%')).toBe('-3%');
    });
});

describe('isNumericText', () => {
    it('recognises figures but not tickers or names', () => {
        for (const ok of ['12,400', '+24.1%', '-8.3%', '¥1.2M', '500 JPY', '−$1,200']) expect(isNumericText(ok)).toBe(true);
        for (const no of ['7203.T', 'AAPL', 'Toyota', '2020-2021', '']) expect(isNumericText(no)).toBe(false);
    });
});

describe('action blocks', () => {
    it('parses a fenced action block, complete or still streaming', () => {
        const done = parseBlocks('Sure.\n\n```action\n{"id":"refresh_prices"}\n```\n\nDone.');
        expect(done.map(b => b.t)).toEqual(['p', 'action', 'p']);
        expect(done[1]).toEqual({ t: 'action', raw: '{"id":"refresh_prices"}', complete: true });
        const partial = parseBlocks('```action\n{"id":"refr');
        expect(partial[0]).toMatchObject({ t: 'action', complete: false });
    });

    it('accepts a valid id with a short plain reason', () => {
        expect(parseActionSpec('{"id":"refresh_pinned","reason":"Prices look old"}')).toEqual({ id: 'refresh_pinned', reason: 'Prices look old' });
        expect(parseActionSpec('{"id":"refresh_pinned"}')).toEqual({ id: 'refresh_pinned' });
    });

    it('clips the reason and strips control characters', () => {
        const spec = parseActionSpec(JSON.stringify({ id: 'a', reason: `x\n${'y'.repeat(MAX_ACTION_REASON_CHARS * 2)}` }))!;
        expect(spec.reason!.length).toBeLessThanOrEqual(MAX_ACTION_REASON_CHARS);
        expect(spec.reason).not.toMatch(/[\u0000-\u001f]/);
    });

    it.each([
        ['not json', 'refresh'],
        ['array', '[1]'],
        ['no id', '{"reason":"x"}'],
        ['numeric id', '{"id":5}'],
        ['uppercase id', '{"id":"Refresh"}'],
        ['id with path chars', '{"id":"../etc"}'],
        ['id too long', `{"id":"${'a'.repeat(41)}"}`],
    ])('rejects %s', (_n, raw) => {
        expect(parseActionSpec(raw)).toBeNull();
    });
});
