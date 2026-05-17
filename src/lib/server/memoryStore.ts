/**
 * In-memory cache replacing SQLite for prices and FX rates.
 * Cleared on server restart — acceptable for a public demo tool.
 */

type DateString = string; // YYYY-MM-DD

const priceStore = new Map<string, { price: number; date: DateString }>();
const fxRateStore = new Map<string, Map<DateString, number>>();

function todayString(): DateString {
  return new Date().toISOString().split('T')[0];
}

// ── Prices ────────────────────────────────────────────────────

export function getCachedTodayPrice(symbol: string): number | null {
  const entry = priceStore.get(symbol);
  if (entry && entry.date === todayString()) return entry.price;
  return null;
}

// Last known price for a symbol regardless of date — used as a fallback when
// Yahoo is rate-limiting us. Avoids leaving rows stuck at "Loading…".
export function getLastKnownPrice(symbol: string): { price: number; date: string } | null {
  return priceStore.get(symbol) ?? null;
}

export function setCachedPrice(symbol: string, price: number): void {
  priceStore.set(symbol, { price, date: todayString() });
}

// ── FX Rates ──────────────────────────────────────────────────

export function getCachedFxRate(pair: string, date: DateString): number | null {
  return fxRateStore.get(pair)?.get(date) ?? null;
}

export function setCachedFxRate(pair: string, rate: number, date: DateString = todayString()): void {
  if (!fxRateStore.has(pair)) fxRateStore.set(pair, new Map());
  fxRateStore.get(pair)!.set(date, rate);
}
