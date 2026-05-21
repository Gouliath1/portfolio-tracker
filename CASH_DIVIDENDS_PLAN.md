# Cash Dividends — Implementation Plan

Handoff doc for the next coding agent working on this branch
(`claude/cash-dividend-api-integration-YO9wR`). Captures the
decisions reached so far so you can pick up without re-doing the
exploration.

## Context (current state of the repo)

- No dividend concept exists anywhere in the codebase
  (`grep -ri dividend src/ __tests__/ scripts/` returns nothing).
- Database is SQLite/Turso. Schema lives in
  `src/lib/server/database/schema.ts`. Relevant existing tables:
  - `securities` (id, ticker, name, currency, …)
  - `securities_prices` (security_id, price_date, OHLC, adjusted_close, volume)
  - `positions` (position_set_id, account_id, security_id, quantity,
    average_cost, cost_basis, position_currency, transaction_date)
  - `accounts`, `brokers`, `currencies`, `fx_rates`, `position_sets`.
- Price fetching uses Yahoo Finance's chart endpoint via
  `src/lib/core/yahooFinanceApi.ts`. It already serializes requests
  through a `withRateLimit` queue and supports both server-side
  (`https://query1.finance.yahoo.com/v8/finance/chart/{symbol}`)
  and client-side (`/api/historical-prices?...`) paths.
- API routes live under `src/app/api/*` (positions, pnl, prices,
  historical-data, historical-prices, fx-rates, …). Services that
  wrap DB access are in `src/lib/server/services/`.

## Recommended approach

Two-layer model — keep issuer events separate from cash receipts.

### Layer 1 — Dividend events (API-sourced, per share)

A new table, mirrors `securities_prices`:

```sql
CREATE TABLE IF NOT EXISTS dividend_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  security_id INTEGER NOT NULL,
  ex_date DATE NOT NULL,
  pay_date DATE,
  amount_per_share DECIMAL(15,6) NOT NULL,
  currency TEXT NOT NULL,
  dividend_type TEXT NOT NULL DEFAULT 'regular', -- regular | special | other
  source TEXT NOT NULL DEFAULT 'yahoo',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (security_id) REFERENCES securities (id),
  FOREIGN KEY (currency) REFERENCES currencies (code),
  UNIQUE (security_id, ex_date, dividend_type)
);
```

Purpose: total-return calculations alongside price-based P&L.
Populated from Yahoo Finance. Do **not** try to encode tax,
withholding, or FX-at-receipt here.

### Layer 2 — Cash receipts (manual / broker import)

Defer until needed. Sketch:

```sql
CREATE TABLE IF NOT EXISTS cash_dividend_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  security_id INTEGER NOT NULL,
  pay_date DATE NOT NULL,
  gross_amount DECIMAL(15,4) NOT NULL,
  withholding_tax DECIMAL(15,4) DEFAULT 0,
  net_amount DECIMAL(15,4) NOT NULL,
  currency TEXT NOT NULL,
  fx_rate_to_base DECIMAL(15,8),
  dividend_event_id INTEGER, -- nullable link back to layer 1
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES accounts (id),
  FOREIGN KEY (security_id) REFERENCES securities (id),
  FOREIGN KEY (currency) REFERENCES currencies (code),
  FOREIGN KEY (dividend_event_id) REFERENCES dividend_events (id)
);
```

This is the tax/cash-reality side. It is what reconciles to a bank
statement (NISA withholding, JP-source taxes, fractional rounding,
FX at payment, etc.) and is **not** something any free API will
give you per-user. Plan: manual entry first, broker CSV import
later.

## API choice — Yahoo Finance

Already integrated, no API key required, covers both US and `.T`
(Japanese) tickers. Same chart endpoint you use for prices returns
dividend events when you add `&events=div`:

```
https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range={range}&events=div
```

Response includes `chart.result[0].events.dividends` shaped as:

```json
{
  "<timestamp>": { "amount": 0.24, "date": <timestamp> }
}
```

One request can fetch both prices and dividends — extend the
existing fetch rather than adding a second round-trip.

Alternatives if Yahoo becomes unreliable:
- Financial Modeling Prep: `/historical-price-full/stock_dividend/{symbol}`
- Alpha Vantage: `function=DIVIDENDS`
- Tiingo, Polygon

All require API keys, and JP coverage on the non-Yahoo providers is
patchy. Don't switch unless forced.

## Concrete implementation steps

1. **Schema**
   - Add `dividend_events` table + creation block in
     `src/lib/server/database/schema.ts` (`SCHEMA_SQL` map). Order
     after `securities_prices` so FK ordering stays sensible.
   - No default data needed.

2. **Yahoo fetch — extend `src/lib/core/yahooFinanceApi.ts`**
   - Add `&events=div` to the server-side URL.
   - Add an exported `fetchHistoricalDividends(symbol, positions)`
     that reuses the same URL parsing but returns
     `{ [isoDate]: { amount, currency } }`.
   - Cheapest path: have one internal fetch return both
     `prices` and `dividends`, then split at the call sites that
     only want prices today.

3. **Service**
   - New `src/lib/server/services/dividendService.ts` modeled on
     `historicalDataService.ts`. Functions:
     - `refreshDividendsForSymbol(ticker)` — fetch from Yahoo,
       upsert into `dividend_events`.
     - `refreshAllDividends()` — iterate over all securities held in
       any active position set.
     - `getDividendsForSecurity(securityId, fromDate?)` — read.
   - Use `INSERT OR IGNORE` against the
     `UNIQUE (security_id, ex_date, dividend_type)` constraint.

4. **API routes** (`src/app/api/dividends/`)
   - `GET /api/dividends` — return dividend events, optionally
     filtered by `?ticker=` or `?from=`.
   - `POST /api/dividends/refresh` — trigger a refresh from Yahoo
     for all held securities. Mirror the pattern in
     `src/app/api/historical-data/route.ts`.
   - Document both in `API.md`.

5. **Types** (`src/types/portfolio.ts`)
   - `DividendEvent` matching the table.
   - Extend `Position` / `PortfolioSummary` only when step 6 lands;
     don't widen types speculatively.

6. **Use in P&L** (do this in a follow-up PR; don't bundle)
   - Sum dividends per `(security_id, account_id)` for the period
     a position has been held (`transaction_date` → now).
   - Convert to base currency via `fx_rates` at `pay_date`
     (or `ex_date` if `pay_date` null).
   - Surface as `dividendIncomeJPY` on the position payload and as
     a `totalDividendsJPY` on `PortfolioSummary`.
   - Total-return % = `(currentValue + cumulativeDividends - cost) / cost`.

7. **Tests** — add under `__tests__/` next to the existing service
   tests. Cover at minimum: parsing a sample Yahoo response with
   dividends, idempotency of the upsert, and the
   `getDividendsForSecurity` filter.

## Tradeoffs / open questions

- **Adjusted close vs explicit dividend tracking.** Yahoo's
  `adjusted_close` already bakes dividends into price. If you only
  care about total return, you could just switch P&L to use
  `adjusted_close`. The reason to track dividends explicitly is to
  *show* dividend income as a line item (which is what the user
  ultimately wants for a personal tracker) and to feed Layer 2.
- **Currency of the dividend.** Yahoo returns the amount in the
  security's listing currency. Store that on the row; convert at
  read time.
- **Stock splits.** Yahoo's chart endpoint also returns
  `events.splits` with `&events=div%2Csplit`. Out of scope here,
  but the same fetch could cheaply capture splits if a future task
  needs them.
- **Backfill window.** `getYahooRange` in `yahooFinanceApi.ts`
  picks range from earliest position date. Reuse it for the
  dividend fetch so we don't miss history when a position is older
  than the default range.
- **Reconciliation gap.** Layer 1 alone will not match the cash
  that hit your bank — withholding tax and FX timing diverge. If
  reconciliation matters more than total-return math, prioritize
  Layer 2 (manual entry UI) over the P&L integration in step 6.

## What NOT to do

- Don't add a "dividend yield" column scraped from quote endpoints.
  It's a derived ratio, not a fact; compute it from
  `dividend_events` + `securities_prices`.
- Don't conflate ex-date and pay-date. P&L attribution uses ex-date
  (ownership cutoff). Cash accounting uses pay-date. The schema
  keeps both for a reason.
- Don't speculatively wire a second provider. Yahoo is good enough
  until it isn't.
