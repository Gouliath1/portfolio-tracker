#!/usr/bin/env node
/**
 * Fetch index constituents and write a static JSON list to src/data/indices/.
 *
 * Why offline/static: constituents change slowly (index reshuffles), so we
 * fetch them once here and commit the result — the app then renders instantly
 * with no runtime scraping. Re-run this script to refresh.
 *
 * Usage:
 *   node scripts/fetch-constituents.mjs            # all indices in the registry
 *   node scripts/fetch-constituents.mjs topix      # one index
 *
 * Adding another index = add a resolver to SOURCES below. Each source URL is
 * provider-specific and must be validated when added (BlackRock's JP site
 * exposes the holdings CSV link in static HTML; other sites differ).
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'src', 'data', 'indices');

const UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120 Safari/537.36';

/**
 * Parse a single CSV line, honoring double-quoted fields that contain commas.
 */
function parseCsvLine(line) {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
            else inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
            out.push(cur); cur = '';
        } else {
            cur += ch;
        }
    }
    out.push(cur);
    return out.map(s => s.trim());
}

/**
 * iShares (BlackRock JP) ETF holdings resolver. Scrapes the product page for
 * the *current* holdings CSV link (its id changes), downloads it, and returns
 * equity constituents only. `suffix` is appended to each ticker for Yahoo
 * (".T" for Tokyo).
 */
async function iSharesJp({ productUrl, suffix }) {
    const pageRes = await fetch(productUrl, { headers: { 'User-Agent': UA } });
    if (!pageRes.ok) throw new Error(`product page HTTP ${pageRes.status}`);
    const html = await pageRes.text();

    const m = html.match(/\/jp\/[^"']*\.ajax\?[^"']*fileType=csv[^"']*holdings[^"']*/i);
    if (!m) throw new Error('could not find holdings CSV link on product page');
    const csvUrl = new URL(m[0], 'https://www.blackrock.com').href;

    const csvRes = await fetch(csvUrl, { headers: { 'User-Agent': UA } });
    if (!csvRes.ok) throw new Error(`csv HTTP ${csvRes.status}`);
    const csv = (await csvRes.text()).replace(/^﻿/, '');
    const lines = csv.split(/\r?\n/);

    // Find "as of" date and the header row.
    let asOf = null;
    let headerIdx = -1;
    for (let i = 0; i < lines.length; i++) {
        if (asOf === null) {
            const dm = lines[i].match(/as of,\s*"?(\d{4}\/\d{2}\/\d{2})"?/i);
            if (dm) asOf = dm[1].replace(/\//g, '-');
        }
        if (/^Ticker,/.test(lines[i].replace(/^"/, ''))) { headerIdx = i; break; }
    }
    if (headerIdx === -1) throw new Error('could not find CSV header row');

    const header = parseCsvLine(lines[headerIdx]);
    const col = (name) => header.findIndex(h => h.toLowerCase() === name.toLowerCase());
    const iTicker = col('Ticker');
    const iName = col('Name');
    const iSector = col('Sector');
    const iAsset = col('Asset Class');
    if (iTicker < 0 || iName < 0 || iAsset < 0) throw new Error('unexpected CSV columns');

    const constituents = [];
    const seen = new Set();
    for (let i = headerIdx + 1; i < lines.length; i++) {
        const raw = lines[i];
        if (!raw.trim() || raw.startsWith('*')) continue;
        const f = parseCsvLine(raw);
        // Keep equities only — drops JPY cash, cash collateral, margin, futures.
        if ((f[iAsset] || '').toLowerCase() !== 'equity') continue;
        const code = (f[iTicker] || '').trim();
        const name = (f[iName] || '').trim();
        if (!code || !name || seen.has(code)) continue;
        seen.add(code);
        constituents.push({
            symbol: `${code}${suffix}`,
            code,
            name,
            sector: (f[iSector] || '').trim() || null,
        });
    }
    if (constituents.length === 0) throw new Error('parsed 0 equity constituents');
    return { asOf, constituents };
}

const SOURCES = {
    topix: {
        index: 'TOPIX',
        source: 'iShares Core TOPIX ETF (1475) holdings — BlackRock',
        resolve: () => iSharesJp({
            productUrl: 'https://www.blackrock.com/jp/individual-en/en/products/279438/ishares-core-topix-etf-fund',
            suffix: '.T',
        }),
    },
};

async function build(key) {
    const src = SOURCES[key];
    if (!src) throw new Error(`unknown index "${key}" (known: ${Object.keys(SOURCES).join(', ')})`);
    process.stdout.write(`Fetching ${src.index}… `);
    const { asOf, constituents } = await src.resolve();
    const payload = {
        index: src.index,
        asOf,
        source: src.source,
        fetchedAt: new Date().toISOString().split('T')[0],
        count: constituents.length,
        constituents,
    };
    await mkdir(OUT_DIR, { recursive: true });
    const outPath = join(OUT_DIR, `${key}.json`);
    await writeFile(outPath, JSON.stringify(payload, null, 2) + '\n');
    console.log(`${constituents.length} constituents → ${outPath} (as of ${asOf})`);
}

const args = process.argv.slice(2);
const keys = args.length ? args : Object.keys(SOURCES);
let failed = false;
for (const key of keys) {
    try {
        await build(key);
    } catch (err) {
        failed = true;
        console.error(`Failed for "${key}": ${err.message}`);
    }
}
process.exit(failed ? 1 : 0);
