/**
 * Server-only access to Yahoo's authenticated quoteSummary endpoint.
 *
 * Unlike the public v8 chart endpoint (used in core/yahooFinanceApi.ts for
 * prices), quoteSummary requires a cookie + crumb pair, otherwise it 401s with
 * "Invalid Crumb". The flow:
 *   1. GET https://fc.yahoo.com  → Set-Cookie: A3=…  (no EU consent wall in JP)
 *   2. GET /v1/test/getcrumb with that cookie → a short crumb string
 *   3. GET /v10/finance/quoteSummary/<sym>?modules=…&crumb=<crumb> with the cookie
 *
 * The cookie+crumb are cached in module memory and refreshed on the next 401.
 * Requests are serialized with a small delay to stay under Yahoo's per-IP limit.
 */

import type { StockFundamentals } from '@portfolio/types/screener';
import { getStoredYahooAuth, setStoredYahooAuth, clearStoredYahooAuth } from './marketDataDb';

const UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120 Safari/537.36';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Serialize outgoing Yahoo requests (same rationale as core's withRateLimit).
let queue = Promise.resolve();
const MIN_DELAY = 120;
function serialized<T>(fn: () => Promise<T>): Promise<T> {
    const result = queue.then(async () => {
        await delay(MIN_DELAY + Math.random() * 100);
        return fn();
    });
    queue = result.then(() => {}, () => {});
    return result;
}

interface Auth { cookie: string; crumb: string; }
let cachedAuth: Auth | null = null;
// Dedupe concurrent auth fetches so a page-load burst doesn't hammer getcrumb.
let authInFlight: Promise<Auth> | null = null;
// Short backoff after a failed auth so we don't tight-loop getcrumb — but kept
// small so each interactive row click genuinely retries (a 60s window made one
// transient 429 blank every other row for a minute).
let authFailUntil = 0;
const AUTH_BACKOFF_MS = 4000;
const CRUMB_HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];

async function getCookie(): Promise<string> {
    // fc.yahoo.com returns 404 but still Set-Cookie: A3=…
    const res = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA } });
    const setCookies =
        typeof res.headers.getSetCookie === 'function'
            ? res.headers.getSetCookie()
            : [res.headers.get('set-cookie') ?? ''];
    const cookie = setCookies.map(c => c.split(';')[0]).filter(Boolean).join('; ');
    if (!cookie) throw new Error('no Set-Cookie from fc.yahoo.com');
    return cookie;
}

// getcrumb is aggressively per-IP rate-limited, so retry across both hosts with
// exponential backoff. A valid crumb is a short token with no spaces/braces.
async function getCrumb(cookie: string): Promise<string> {
    let lastStatus = 0;
    for (let attempt = 0; attempt < 4; attempt++) {
        const host = CRUMB_HOSTS[attempt % CRUMB_HOSTS.length];
        const res = await fetch(`${host}/v1/test/getcrumb`, { headers: { 'User-Agent': UA, Cookie: cookie } });
        lastStatus = res.status;
        const crumb = (await res.text()).trim();
        if (res.ok && crumb && !crumb.includes('{') && !crumb.includes(' ')) return crumb;
        await delay(400 * Math.pow(2, attempt) + Math.random() * 200);
    }
    throw new Error(`bad crumb (HTTP ${lastStatus})`);
}

async function fetchAuth(): Promise<Auth> {
    const cookie = await getCookie();
    const crumb = await getCrumb(cookie);
    return { cookie, crumb };
}

let triedStored = false;

// Manual override: a cookie+crumb obtained out-of-band (e.g. on a clean network)
// and dropped into .env.local. Bypasses the throttled getcrumb entirely — the
// app then fetches ratios via quoteSummary using these directly. Highest
// priority; refreshed by the user when it eventually expires.
function envAuth(): Auth | null {
    const cookie = process.env.YAHOO_COOKIE;
    const crumb = process.env.YAHOO_CRUMB;
    return cookie && crumb ? { cookie, crumb } : null;
}

async function getAuth(force = false): Promise<Auth> {
    const fromEnv = envAuth();
    if (fromEnv) return fromEnv;

    if (!force && cachedAuth) return cachedAuth;

    // Cold start: reuse a previously-persisted crumb before touching the
    // (throttled) getcrumb endpoint. A persisted crumb is valid for hours, so
    // this is what makes the throttle stop mattering across restarts/sessions.
    if (!force && !triedStored) {
        triedStored = true;
        const stored = await getStoredYahooAuth();
        if (stored) { cachedAuth = stored; return stored; }
    }

    if (Date.now() < authFailUntil) throw new Error('auth backoff (recent failure)');
    if (force) { cachedAuth = null; void clearStoredYahooAuth(); }

    // Share one fetch among all concurrent/queued callers.
    if (!authInFlight) {
        authInFlight = fetchAuth()
            .then(auth => { cachedAuth = auth; void setStoredYahooAuth(auth.cookie, auth.crumb); return auth; })
            .catch(err => { authFailUntil = Date.now() + AUTH_BACKOFF_MS; throw err; })
            .finally(() => { authInFlight = null; });
    }
    return authInFlight;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function raw(node: any): number | null {
    if (node == null) return null;
    if (typeof node === 'number') return node;
    return typeof node.raw === 'number' ? node.raw : null;
}

const MODULES = 'summaryDetail,defaultKeyStatistics,price';

/**
 * Fetch and normalize fundamentals for one symbol. Returns null on hard
 * failure (network/parse); individual missing fields come back as null.
 */
export async function fetchQuoteSummary(symbol: string): Promise<StockFundamentals> {
    const call = async (auth: Auth): Promise<Response> => {
        const url =
            `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}` +
            `?modules=${MODULES}&crumb=${encodeURIComponent(auth.crumb)}`;
        return fetch(url, { headers: { 'User-Agent': UA, Cookie: auth.cookie } });
    };

    // Throws on hard failure with a descriptive reason so the route can surface
    // why (cookie vs crumb-429 vs quoteSummary status) instead of a blank 502.
    return serialized(async () => {
        let auth = await getAuth();
        let res = await call(auth);
        // Crumb/cookie expired → refresh once and retry.
        if (res.status === 401) {
            auth = await getAuth(true);
            res = await call(auth);
        }
        if (!res.ok) throw new Error(`quoteSummary HTTP ${res.status}`);

        const data = await res.json();
        const result = data?.quoteSummary?.result?.[0];
        if (!result) throw new Error('quoteSummary returned no result');

        const sd = result.summaryDetail ?? {};
        const ks = result.defaultKeyStatistics ?? {};
        const pr = result.price ?? {};

        return {
            symbol,
            name: pr.shortName ?? pr.longName ?? null,
            price: raw(pr.regularMarketPrice),
            currency: pr.currency ?? null,
            trailingPE: raw(sd.trailingPE),
            forwardPE: raw(sd.forwardPE),
            // JP names null `dividendYield`; fall back to the trailing figure.
            dividendYield: raw(sd.dividendYield) ?? raw(sd.trailingAnnualDividendYield),
            priceToBook: raw(ks.priceToBook),
            marketCap: raw(sd.marketCap) ?? raw(pr.marketCap),
        };
    });
}
