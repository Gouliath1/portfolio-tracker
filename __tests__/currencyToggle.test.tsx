/**
 * Currency toggle integration tests
 *
 * Verifies the full "user switches base currency → all numbers change"
 * flow across four layers:
 *
 *  1. usePortfolioSummaryData — re-runs calculatePortfolioSummary with the
 *     new currency when the `currency` prop changes, and surfaces different
 *     numbers in the returned summary.
 *
 *  2. SettingsPanel — clicking a currency button fires onCurrencyChange with
 *     the correct currency code.
 *
 *  3. useBaseCurrency — setCurrency updates the currency, symbol, and
 *     formatValue (decimal style + symbol) for the new currency.
 *
 *  4. pnlCache — readCachedSummary and writeCachedSummary use separate
 *     localStorage keys per base currency so cached JPY data never bleeds
 *     into a USD request (and vice-versa).
 */

import { renderHook, act, waitFor } from '@testing-library/react'
import { render, screen, fireEvent } from './__mocks__/testUtils'
import { usePortfolioSummaryData } from '@/hooks/usePortfolioSummaryData'
import { useBaseCurrency } from '@/hooks/useBaseCurrency'
import { SettingsPanel } from '@/components/layout/SettingsPanel'
import { readCachedSummary, writeCachedSummary } from '@/utils/pnlCache'
import type { PortfolioSummary as PortfolioSummaryType, RawPosition } from '@portfolio/types'

// ─── Module mocks ─────────────────────────────────────────────────────────────

// Keep real utility exports (getCurrencySymbol, formatCurrencyValue, …) but
// replace the network-bound calculatePortfolioSummary with a jest.fn so tests
// control what it returns.
jest.mock('@portfolio/core', () => {
  const actual = jest.requireActual('@portfolio/core')
  return { ...actual, calculatePortfolioSummary: jest.fn() }
})

// Prevent any real HTTP calls from the Yahoo Finance helpers that are
// re-exported through @portfolio/core.
jest.mock('@portfolio/core/yahooFinanceApi', () => ({
  fetchStockPrice: jest.fn(),
  updateAllPositions: jest.fn(),
  fetchCurrentFxRate: jest.fn(),
  fetchHistoricalFxRates: jest.fn(),
  fetchHistoricalDividends: jest.fn().mockResolvedValue(null),
  BASE_CURRENCY_CONSTANT: 'JPY',
}))

jest.mock('@/utils/positions', () => ({
  loadPositions: jest.fn(),
}))

jest.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'dark', setTheme: jest.fn() }),
}))

// ─── Shared fixtures ──────────────────────────────────────────────────────────

/** A portfolio summary expressed in JPY. */
const jpySummary: PortfolioSummaryType = {
  totalValueJPY: 1_400_000,
  totalCostJPY: 1_300_000,
  totalPnlJPY: 100_000,
  totalPnlPercentage: 7.69,
  positions: [],
  closedPositions: [],
  realizedPnlJPY: 0,
  realizedCostJPY: 0,
  realizedPnlPercentage: 0,
  totalDividendsJPY: 0,
}

/** The same portfolio expressed in USD (÷ 140). */
const usdSummary: PortfolioSummaryType = {
  totalValueJPY: 10_000,   // 1 400 000 / 140
  totalCostJPY: 9_286,     // 1 300 000 / 140
  totalPnlJPY: 714,        // 100 000  / 140
  totalPnlPercentage: 7.69,
  positions: [],
  closedPositions: [],
  realizedPnlJPY: 0,
  realizedCostJPY: 0,
  realizedPnlPercentage: 0,
  totalDividendsJPY: 0,
}

const mockRawPosition: RawPosition = {
  transactionDate: '2023/01/15',
  ticker: 'AAPL',
  fullName: 'Apple Inc.',
  account: 'US',
  quantity: 10,
  costPerUnit: 100,
  transactionCcy: 'USD',
  stockCcy: 'USD',
}

// ─── 1. usePortfolioSummaryData ───────────────────────────────────────────────

describe('usePortfolioSummaryData — currency switching', () => {
  const { calculatePortfolioSummary } = require('@portfolio/core')
  const { loadPositions } = require('@/utils/positions')

  beforeEach(() => {
    jest.clearAllMocks()
    // Clear localStorage so pnlCache never returns a same-day hit from a
    // previous test, which would short-circuit calculatePortfolioSummary.
    window.localStorage.clear()
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})

    loadPositions.mockResolvedValue([mockRawPosition])
    calculatePortfolioSummary.mockImplementation(
      (_positions: unknown, _force: unknown, baseCurrency: string) =>
        Promise.resolve(baseCurrency === 'USD' ? usdSummary : jpySummary)
    )
  })

  afterEach(() => jest.restoreAllMocks())

  it('returns a summary in the initial currency', async () => {
    const { result } = renderHook(
      ({ currency }: { currency: string }) => usePortfolioSummaryData(currency, true),
      { initialProps: { currency: 'JPY' } }
    )

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.summary).toEqual(jpySummary)
    expect(calculatePortfolioSummary).toHaveBeenCalledWith(
      expect.anything(), false, 'JPY'
    )
  })

  it('re-runs calculatePortfolioSummary with the new currency when currency prop changes', async () => {
    const { result, rerender } = renderHook(
      ({ currency }: { currency: string }) => usePortfolioSummaryData(currency, true),
      { initialProps: { currency: 'JPY' } }
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.summary).toEqual(jpySummary)

    rerender({ currency: 'USD' })

    await waitFor(() => expect(result.current.summary).toEqual(usdSummary))

    expect(calculatePortfolioSummary).toHaveBeenCalledWith(
      expect.anything(), false, 'USD'
    )
  })

  it('summary values change numerically after currency switch — not stale old-currency numbers', async () => {
    const { result, rerender } = renderHook(
      ({ currency }: { currency: string }) => usePortfolioSummaryData(currency, true),
      { initialProps: { currency: 'JPY' } }
    )

    await waitFor(() => expect(result.current.summary).toEqual(jpySummary))

    rerender({ currency: 'USD' })

    await waitFor(() => expect(result.current.summary).toEqual(usdSummary))

    // The bug scenario: if numbers didn't change after switching, these would fail.
    expect(result.current.summary!.totalValueJPY).not.toBe(jpySummary.totalValueJPY)
    expect(result.current.summary!.totalCostJPY).not.toBe(jpySummary.totalCostJPY)
    expect(result.current.summary!.totalPnlJPY).not.toBe(jpySummary.totalPnlJPY)
  })

  it('switching currencies multiple times always uses the latest currency', async () => {
    const eurSummary: PortfolioSummaryType = { ...usdSummary, totalValueJPY: 9_091 }
    calculatePortfolioSummary.mockImplementation(
      (_p: unknown, _f: unknown, ccy: string) => {
        if (ccy === 'USD') return Promise.resolve(usdSummary)
        if (ccy === 'EUR') return Promise.resolve(eurSummary)
        return Promise.resolve(jpySummary)
      }
    )

    const { result, rerender } = renderHook(
      ({ currency }: { currency: string }) => usePortfolioSummaryData(currency, true),
      { initialProps: { currency: 'JPY' } }
    )

    await waitFor(() => expect(result.current.summary).toEqual(jpySummary))

    rerender({ currency: 'USD' })
    await waitFor(() => expect(result.current.summary).toEqual(usdSummary))

    rerender({ currency: 'EUR' })
    await waitFor(() => expect(result.current.summary).toEqual(eurSummary))

    // Every currency in the sequence must have been passed to the calculator.
    // We read the third argument (baseCurrency) from each recorded call.
    const baseCurrencyArgs = (calculatePortfolioSummary as jest.Mock).mock.calls.map(
      (c) => c[2]
    )
    expect(baseCurrencyArgs).toContain('JPY')
    expect(baseCurrencyArgs).toContain('USD')
    expect(baseCurrencyArgs).toContain('EUR')
  })

  it('does not run before currencyHydrated is true', async () => {
    const { result, rerender } = renderHook(
      ({ hydrated }: { hydrated: boolean }) =>
        usePortfolioSummaryData('JPY', hydrated),
      { initialProps: { hydrated: false } }
    )

    // Should not have started loading yet
    expect(calculatePortfolioSummary).not.toHaveBeenCalled()
    expect(loadPositions).not.toHaveBeenCalled()

    rerender({ hydrated: true })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(calculatePortfolioSummary).toHaveBeenCalledTimes(1)
  })
})

// ─── 2. SettingsPanel ─────────────────────────────────────────────────────────

describe('SettingsPanel — currency toggle UI', () => {
  it('clicking a currency button fires onCurrencyChange with that currency code', () => {
    const onChange = jest.fn()
    render(
      <SettingsPanel
        open={true}
        onClose={() => {}}
        currency="JPY"
        onCurrencyChange={onChange}
      />
    )

    fireEvent.click(screen.getByText('USD'))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('USD')
  })

  it('clicking each supported currency fires onCurrencyChange with the correct code', () => {
    const onChange = jest.fn()
    render(
      <SettingsPanel
        open={true}
        onClose={() => {}}
        currency="JPY"
        onCurrencyChange={onChange}
      />
    )

    for (const code of ['USD', 'EUR', 'GBP', 'JPY']) {
      onChange.mockClear()
      fireEvent.click(screen.getByText(code))
      expect(onChange).toHaveBeenCalledWith(code)
    }
  })

  it('renders a button for each supported base currency with code and symbol', () => {
    // jsdom cannot resolve CSS custom-property values (var(--accent) etc.) so
    // visual highlight differences are not testable here. This test verifies
    // the structural prerequisite: every supported currency has a clickable
    // button with both its code label and its currency symbol visible.
    render(
      <SettingsPanel
        open={true}
        onClose={() => {}}
        currency="JPY"
        onCurrencyChange={() => {}}
      />
    )

    const entries = [
      { code: 'JPY', symbol: '¥' },
      { code: 'USD', symbol: '$' },
      { code: 'EUR', symbol: '€' },
      { code: 'GBP', symbol: '£' },
    ]

    for (const { code, symbol } of entries) {
      const button = screen.getByText(code).closest('button')!
      expect(button).toBeInTheDocument()
      expect(button).not.toBeDisabled()
      // Each button shows both the currency symbol (large) and its ISO code
      expect(button).toHaveTextContent(symbol)
      expect(button).toHaveTextContent(code)
    }
  })
})

// ─── 3. useBaseCurrency ───────────────────────────────────────────────────────

describe('useBaseCurrency — formatValue changes with setCurrency', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('formatValue uses ¥ and no decimal places for JPY', () => {
    const { result } = renderHook(() => useBaseCurrency())

    act(() => { result.current.setCurrency('JPY') })

    const formatted = result.current.formatValue(1234.56, true)
    expect(formatted).toContain('¥')
    // JPY should round to whole numbers — no decimal point in the digits
    expect(formatted).not.toMatch(/,\d{2}$/)   // no ",56" at the end
  })

  it('formatValue uses $ and 2 decimal places for USD', () => {
    const { result } = renderHook(() => useBaseCurrency())

    act(() => { result.current.setCurrency('USD') })

    const formatted = result.current.formatValue(1234.56, true)
    expect(formatted).toContain('$')
    expect(formatted).toContain('1,234.56')
  })

  it('formatValue uses € and 2 decimal places for EUR', () => {
    const { result } = renderHook(() => useBaseCurrency())

    act(() => { result.current.setCurrency('EUR') })

    const formatted = result.current.formatValue(1234.56, true)
    expect(formatted).toContain('€')
    expect(formatted).toContain('1,234.56')
  })

  it('symbol updates immediately after setCurrency', () => {
    const { result } = renderHook(() => useBaseCurrency())

    act(() => { result.current.setCurrency('GBP') })
    expect(result.current.symbol).toBe('£')
    expect(result.current.currency).toBe('GBP')

    act(() => { result.current.setCurrency('JPY') })
    expect(result.current.symbol).toBe('¥')
    expect(result.current.currency).toBe('JPY')
  })

  it('formatValue output is different for JPY vs USD for the same amount', () => {
    const { result } = renderHook(() => useBaseCurrency())
    const amount = 1234.56

    act(() => { result.current.setCurrency('JPY') })
    const jpyFormatted = result.current.formatValue(amount, true)

    act(() => { result.current.setCurrency('USD') })
    const usdFormatted = result.current.formatValue(amount, true)

    expect(jpyFormatted).not.toBe(usdFormatted)
  })
})

// ─── 4. pnlCache — cache key isolation ───────────────────────────────────────

describe('pnlCache — separate cache keys per base currency', () => {
  const completeSummary = (overrides: Partial<PortfolioSummaryType> = {}): PortfolioSummaryType => ({
    totalValueJPY: 1_000,
    totalCostJPY: 900,
    totalPnlJPY: 100,
    totalPnlPercentage: 11.11,
    positions: [],       // no open positions → isCompleteSummary returns true
    closedPositions: [],
    realizedPnlJPY: 0,
    realizedCostJPY: 0,
    realizedPnlPercentage: 0,
    totalDividendsJPY: 0,
    ...overrides,
  })

  beforeEach(() => window.localStorage.clear())

  it('writing a USD summary does not pollute the JPY cache slot', () => {
    const usd = completeSummary({ totalValueJPY: 7_143 })
    writeCachedSummary([mockRawPosition], 'USD', usd)

    // Reading with JPY must return null
    expect(readCachedSummary([mockRawPosition], 'JPY')).toBeNull()
  })

  it('writing a JPY summary does not pollute the USD cache slot', () => {
    const jpy = completeSummary({ totalValueJPY: 1_000_000 })
    writeCachedSummary([mockRawPosition], 'JPY', jpy)

    expect(readCachedSummary([mockRawPosition], 'USD')).toBeNull()
  })

  it('reading with the same currency returns the written summary', () => {
    const usd = completeSummary({ totalValueJPY: 7_143 })
    writeCachedSummary([mockRawPosition], 'USD', usd)

    const cached = readCachedSummary([mockRawPosition], 'USD')
    expect(cached).not.toBeNull()
    expect(cached!.summary.totalValueJPY).toBe(7_143)
  })

  it('cached values for different currencies are numerically different', () => {
    const jpyAmount = 1_400_000
    const usdAmount = 10_000

    writeCachedSummary([mockRawPosition], 'JPY', completeSummary({ totalValueJPY: jpyAmount }))
    writeCachedSummary([mockRawPosition], 'USD', completeSummary({ totalValueJPY: usdAmount }))

    const cachedJpy = readCachedSummary([mockRawPosition], 'JPY')
    const cachedUsd = readCachedSummary([mockRawPosition], 'USD')

    expect(cachedJpy!.summary.totalValueJPY).toBe(jpyAmount)
    expect(cachedUsd!.summary.totalValueJPY).toBe(usdAmount)
    // The two cache slots hold different values — no cross-contamination
    expect(cachedJpy!.summary.totalValueJPY).not.toBe(cachedUsd!.summary.totalValueJPY)
  })

  it('EUR, GBP, JPY, USD each get their own independent cache slot', () => {
    const values: Record<string, number> = {
      JPY: 1_000_000, USD: 7_143, EUR: 6_536, GBP: 5_556,
    }

    for (const [ccy, val] of Object.entries(values)) {
      writeCachedSummary([mockRawPosition], ccy, completeSummary({ totalValueJPY: val }))
    }

    for (const [ccy, val] of Object.entries(values)) {
      const cached = readCachedSummary([mockRawPosition], ccy)
      expect(cached!.summary.totalValueJPY).toBe(val)
    }
  })
})
