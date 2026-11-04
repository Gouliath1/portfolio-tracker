/**
 * Catch the most common way a sign-in email goes missing: a typo in the domain
 * ("gmil.com"). Only domains close to a well-known provider are flagged, so a
 * company address is never "corrected".
 */

const COMMON_DOMAINS = [
    'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.jp', 'outlook.com', 'hotmail.com',
    'live.com', 'icloud.com', 'me.com', 'proton.me', 'protonmail.com', 'aol.com', 'msn.com',
];

function distance(a: string, b: string): number {
    const row = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        let prev = row[0];
        row[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const tmp = row[j];
            row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
            prev = tmp;
        }
    }
    return row[b.length];
}

/** A corrected address when the domain looks like a typo of a common provider, else null. */
export function suggestEmailFix(email: string): string | null {
    const trimmed = email.trim().toLowerCase();
    const at = trimmed.lastIndexOf('@');
    if (at < 1 || at === trimmed.length - 1) return null;
    const local = trimmed.slice(0, at);
    const domain = trimmed.slice(at + 1);
    if (COMMON_DOMAINS.includes(domain)) return null;

    let best: { domain: string; d: number } | null = null;
    for (const candidate of COMMON_DOMAINS) {
        const d = distance(domain, candidate);
        if (d <= 2 && (!best || d < best.d)) best = { domain: candidate, d };
    }
    // A distance of 2 is only credible when the domain is long enough for it to be a slip.
    if (!best || (best.d === 2 && domain.length < 8)) return null;
    return `${local}@${best.domain}`;
}
