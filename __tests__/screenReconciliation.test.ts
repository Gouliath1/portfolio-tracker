/**
 * Screen reconciliation tests
 *
 * Verifies that every number displayed on screen is internally consistent:
 *   1. forwardFillLookup — FX date forward-fill used for weekend/holiday gaps
 *   2. calculatePosition (open lots) — per-position math invariants
 *   3. calculatePosition (closed lots) — realized P&L invariants
 *   4. calculatePortfolioSummary — portfolio totals equal sums of their parts
 *   5. calculatePortfolioSummary — currency switching produces correctly scaled
 *      values, not stale values from the previous base currency
 *   6. PortfolioSummary component — P&L breakdown chip values reconcile with
 *      the raw summary fields used to derive them
 *
 * The currency-switching suite (section 5) is specifically designed to catch
 * the bug where totalValueJPY / totalCostJPY remain in the old currency after
 * the user changes the base currency selector.
 */

import { calculatePosition, calculatePortfolioSummary, forwardFillLookup } from '@portfolio/core'
import type { RawPosition, PortfolioSummary as PortfolioSummaryType, Position } from '@portfolio/types'
import type { FxLookup } from '@portfolio/core'

jest.mock('@portfolio/core/yahooFinanceApi', () => ({
  fetchStockPrice: jest.fn(),
  updateAllPositions: jest.fn(),
  fetchCurrentFxRate: jest.fn(),
  fetchHistoricalFxRates: jest.fn(),
  fetchHistoricalDividends: jest.fn().mockResolvedValue(null),
}))

// ─── FX constants ────────────────────────────────────────────────────────────
// Using round numbers so expected values are easy to reason about.

const USD_JPY_HIST = 130   // USD→JPY rate at transaction/sale date
const USD_JPY_CURR = 140   // USD→JPY current rate
const EUR_JPY_HIST = 142   // EUR→JPY rate at transaction date
const EUR_JPY_CURR = 155   // EUR→JPY current rate

// ─── Date strings ────────────────────────────────────────────────────────────

const TX_DATE = '2023/01/15'       // slash format (as stored in RawPosition)
const TX_DATE_ISO = '2023-01-15'   // hyphen format (as used in FX lookups)
const SALE_DATE = '2023/08/01'
const SALE_DATE_ISO = '2023-08-01'

// ─── FxLookup builders ───────────────────────────────────────────────────────

/** Prebuilt FxLookup for JPY base currency, covering USD and EUR pairs. */
function makeJpyFxLookup(): FxLookup {
  return {
    historical: new Map([
      ['USDJPY', new Map([[TX_DATE_ISO, USD_JPY_HIST], [SALE_DATE_ISO, USD_JPY_HIST]])],
      ['EURJPY', new Map([[TX_DATE_ISO, EUR_JPY_HIST], [SALE_DATE_ISO, EUR_JPY_HIST]])],
    ]),
    current: new Map([
      ['USDJPY', USD_JPY_CURR],
      ['EURJPY', EUR_JPY_CURR],
    ]),
  }
}

/** Prebuilt FxLookup for USD base currency, covering JPY and EUR pairs. */
function makeUsdFxLookup(): FxLookup {
  return {
    historical: new Map([
      ['JPYUSD', new Map([[TX_DATE_ISO, 1 / USD_JPY_HIST], [SALE_DATE_ISO, 1 / USD_JPY_HIST]])],
      ['EURUSD', new Map([[TX_DATE_ISO, EUR_JPY_HIST / USD_JPY_HIST], [SALE_DATE_ISO, EUR_JPY_HIST / USD_JPY_HIST]])],
    ]),
    current: new Map([
      ['JPYUSD', 1 / USD_JPY_CURR],
      ['EURUSD', EUR_JPY_CURR / USD_JPY_CURR],
    ]),
  }
}

/** Empty FxLookup — used for same-currency positions where no conversion occurs. */
const emptyFxLookup: FxLookup = { historical: new Map(), current: new Map() }

// ─── Position fixtures ───────────────────────────────────────────────────────

const usdOpenPos: RawPosition = {
  transactionDate: TX_DATE,
  ticker: 'AAPL',
  fullName: 'Apple Inc.',
  account: 'US',
  quantity: 10,
  costPerUnit: 100,    // USD
  transactionCcy: 'USD',
  stockCcy: 'USD',
}

const jpyOpenPos: RawPosition = {
  transactionDate: TX_DATE,
  ticker: '7203.T',
  fullName: 'Toyota',
  account: 'JP',
  quantity: 500,
  costPerUnit: 1500,   // JPY
  transactionCcy: 'JPY',
  stockCcy: 'JPY',
}

const usdClosedPos: RawPosition = {
  transactionDate: TX_DATE,
  ticker: 'MSFT',
  fullName: 'Microsoft',
  account: 'US',
  quantity: 20,
  costPerUnit: 200,      // USD
  transactionCcy: 'USD',
  stockCcy: 'USD',
  saleDate: SALE_DATE,
  salePricePerUnit: 250, // USD — a profitable exit
  saleCcy: 'USD',
}

// ─── API mock configurators ───────────────────────────────────────────────────

function setupJpyBaseMocks(priceMap: Record<string, number>) {
  const { fetchStockPrice, fetchCurrentFxRate, fetchHistoricalFxRates } =
    require('@portfolio/core/yahooFinanceApi')

  fetchStockPrice.mockImplementation((ticker: string) =>
    Promise.resolve(priceMap[ticker] ?? null))

  fetchHistoricalFxRates.mockImplementation((pair: string, dates: string[]) => {
    const result: Record<string, number> = {}
    for (const d of dates) {
      if (pair === 'USDJPY') result[d] = USD_JPY_HIST
      else if (pair === 'EURJPY') result[d] = EUR_JPY_HIST
    }
    return Promise.resolve(result)
  })

  fetchCurrentFxRate.mockImplementation((pair: string) => {
    if (pair === 'USDJPY') return Promise.resolve(USD_JPY_CURR)
    if (pair === 'EURJPY') return Promise.resolve(EUR_JPY_CURR)
    return Promise.resolve(1)
  })
}

function setupUsdBaseMocks(priceMap: Record<string, number>) {
  const { fetchStockPrice, fetchCurrentFxRate, fetchHistoricalFxRates } =
    require('@portfolio/core/yahooFinanceApi')

  fetchStockPrice.mockImplementation((ticker: string) =>
    Promise.resolve(priceMap[ticker] ?? null))

  fetchHistoricalFxRates.mockImplementation((pair: string, dates: string[]) => {
    const result: Record<string, number> = {}
    for (const d of dates) {
      if (pair === 'JPYUSD') result[d] = 1 / USD_JPY_HIST
      else if (pair === 'EURUSD') result[d] = EUR_JPY_HIST / USD_JPY_HIST
    }
    return Promise.resolve(result)
  })

  fetchCurrentFxRate.mockImplementation((pair: string) => {
    if (pair === 'JPYUSD') return Promise.resolve(1 / USD_JPY_CURR)
    if (pair === 'EURUSD') return Promise.resolve(EUR_JPY_CURR / USD_JPY_CURR)
    return Promise.resolve(1)
  })
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('forwardFillLookup — FX date forward-fill', () => {
  it('returns exact rate when the date is present in the map', () => {
    const map = new Map([['2023-01-15', 130.5]])
    expect(forwardFillLookup(map, '2023-01-15')).toBe(130.5)
  })

  it('forward-fills to the nearest earlier date for weekends / holidays', () => {
    const map = new Map([
      ['2023-01-13', 129.0], // Friday
      ['2023-01-16', 131.0], // Monday (must NOT be chosen for Saturday)
    ])
    // Saturday 2023-01-14: should use Friday's rate
    expect(forwardFillLookup(map, '2023-01-14')).toBe(129.0)
  })

  it('returns the most recent rate when the target is after all known dates', () => {
    const map = new Map([
      ['2023-01-10', 128.0],
      ['2023-01-13', 129.5],
    ])
    expect(forwardFillLookup(map, '2023-06-01')).toBe(129.5)
  })

  it('picks the latest eligible date among multiple candidates', () => {
    const map = new Map([
      ['2023-01-10', 128.0],
      ['2023-01-12', 129.0],
      ['2023-01-14', 130.0],
      ['2023-01-16', 131.0], // strictly after target → must NOT be chosen
    ])
    // Target 2023-01-15: closest ≤ target is 2023-01-14
    expect(forwardFillLookup(map, '2023-01-15')).toBe(130.0)
  })

  it('returns null for an empty map', () => {
    expect(forwardFillLookup(new Map(), '2023-01-15')).toBeNull()
  })

  it('returns null when all known dates are strictly after the target', () => {
    const map = new Map([['2023-02-01', 130.0]])
    expect(forwardFillLookup(map, '2023-01-15')).toBeNull()
  })
})

// ─── Open lot invariants ─────────────────────────────────────────────────────

describe('calculatePosition — open lot math invariants', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => jest.restoreAllMocks())

  it('JPY stock / JPY base: no FX conversion, fxRates are 1', async () => {
    const pos = await calculatePosition(jpyOpenPos, 1700, 'JPY', emptyFxLookup)

    expect(pos.costInJPY).toBe(1500 * 500)
    expect(pos.currentValueJPY).toBe(1700 * 500)
    expect(pos.transactionFxRate).toBe(1)
    expect(pos.currentFxRate).toBe(1)
    expect(pos.status).toBe('open')
  })

  it('USD stock / JPY base: cost uses historical USDJPY, value uses current USDJPY', async () => {
    const pos = await calculatePosition(usdOpenPos, 120, 'JPY', makeJpyFxLookup())

    expect(pos.costInJPY).toBeCloseTo(100 * 10 * USD_JPY_HIST, 5)
    expect(pos.currentValueJPY).toBeCloseTo(120 * 10 * USD_JPY_CURR, 5)
    expect(pos.transactionFxRate).toBe(USD_JPY_HIST)
    expect(pos.currentFxRate).toBe(USD_JPY_CURR)
  })

  it('USD stock / USD base: no FX conversion, values are in USD directly', async () => {
    const pos = await calculatePosition(usdOpenPos, 120, 'USD', emptyFxLookup)

    // costInJPY field holds the base-currency value (USD when baseCurrency=USD)
    expect(pos.costInJPY).toBeCloseTo(100 * 10, 5)
    expect(pos.currentValueJPY).toBeCloseTo(120 * 10, 5)
    expect(pos.transactionFxRate).toBe(1)
    expect(pos.currentFxRate).toBe(1)
  })

  it('JPY stock / USD base: cost and value convert via JPYUSD rates', async () => {
    const pos = await calculatePosition(jpyOpenPos, 1700, 'USD', makeUsdFxLookup())

    expect(pos.costInJPY).toBeCloseTo((1500 * 500) / USD_JPY_HIST, 4)
    expect(pos.currentValueJPY).toBeCloseTo((1700 * 500) / USD_JPY_CURR, 4)
  })

  it('pnlJPY === currentValueJPY − costInJPY', async () => {
    const pos = await calculatePosition(usdOpenPos, 120, 'JPY', makeJpyFxLookup())

    expect(pos.pnlJPY).toBeCloseTo(pos.currentValueJPY - pos.costInJPY, 5)
  })

  it('pnlPercentage === pnlJPY / costInJPY × 100', async () => {
    const pos = await calculatePosition(usdOpenPos, 120, 'JPY', makeJpyFxLookup())

    const expected = (pos.pnlJPY / pos.costInJPY) * 100
    expect(pos.pnlPercentage).toBeCloseTo(expected, 5)
  })

  it('totalReturnPercentage equals pnlPercentage when dividendIncomeJPY is 0', async () => {
    const pos = await calculatePosition(usdOpenPos, 120, 'JPY', makeJpyFxLookup())

    expect(pos.dividendIncomeJPY).toBe(0)
    expect(pos.totalReturnPercentage).toBeCloseTo(pos.pnlPercentage, 5)
  })

  it('null price: currentValueJPY = 0, pnlJPY = 0, pnlPercentage = 0', async () => {
    const pos = await calculatePosition(usdOpenPos, null, 'JPY', makeJpyFxLookup())

    expect(pos.currentPrice).toBeNull()
    expect(pos.currentValueJPY).toBe(0)
    expect(pos.pnlJPY).toBe(0)
    expect(pos.pnlPercentage).toBe(0)
    expect(pos.status).toBe('open')
  })

  it('cost in JPY base is proportional to cost in USD base by the USDJPY historical rate', async () => {
    const priceUSD = 120
    const posJPY = await calculatePosition(usdOpenPos, priceUSD, 'JPY', makeJpyFxLookup())
    const posUSD = await calculatePosition(usdOpenPos, priceUSD, 'USD', emptyFxLookup)

    // Cost in JPY = cost in USD × USD_JPY_HIST
    expect(posJPY.costInJPY / posUSD.costInJPY).toBeCloseTo(USD_JPY_HIST, 1)

    // Value in JPY = value in USD × USD_JPY_CURR
    expect(posJPY.currentValueJPY / posUSD.currentValueJPY).toBeCloseTo(USD_JPY_CURR, 1)

    // The two values must numerically differ — changing base currency changes the numbers
    expect(posJPY.costInJPY).not.toBeCloseTo(posUSD.costInJPY, 0)
  })
})

// ─── Closed lot invariants ────────────────────────────────────────────────────

describe('calculatePosition — closed lot math invariants', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => jest.restoreAllMocks())

  it('status is closed and currentValueJPY / pnlJPY / pnlPercentage are all 0', async () => {
    const pos = await calculatePosition(usdClosedPos, null, 'JPY', makeJpyFxLookup())

    expect(pos.status).toBe('closed')
    expect(pos.currentValueJPY).toBe(0)
    expect(pos.pnlJPY).toBe(0)
    expect(pos.pnlPercentage).toBe(0)
    expect(pos.currentPrice).toBeNull()
  })

  it('costInJPY and proceedsJPY use the historical USDJPY rate', async () => {
    const pos = await calculatePosition(usdClosedPos, null, 'JPY', makeJpyFxLookup())

    expect(pos.costInJPY).toBeCloseTo(200 * 20 * USD_JPY_HIST, 5)
    expect(pos.proceedsJPY).toBeCloseTo(250 * 20 * USD_JPY_HIST, 5)
    expect(pos.saleFxRate).toBe(USD_JPY_HIST)
  })

  it('realizedPnlJPY === proceedsJPY + dividendIncomeJPY − costInJPY', async () => {
    const pos = await calculatePosition(usdClosedPos, null, 'JPY', makeJpyFxLookup())

    const expected = (pos.proceedsJPY ?? 0) + pos.dividendIncomeJPY - pos.costInJPY
    expect(pos.realizedPnlJPY).toBeCloseTo(expected, 5)
  })

  it('realizedPnlPercentage === realizedPnlJPY / costInJPY × 100', async () => {
    const pos = await calculatePosition(usdClosedPos, null, 'JPY', makeJpyFxLookup())

    const expected = ((pos.realizedPnlJPY ?? 0) / pos.costInJPY) * 100
    expect(pos.realizedPnlPercentage).toBeCloseTo(expected, 5)
  })

  it('totalReturnPercentage equals realizedPnlPercentage for closed lots', async () => {
    const pos = await calculatePosition(usdClosedPos, null, 'JPY', makeJpyFxLookup())

    expect(pos.totalReturnPercentage).toBeCloseTo(pos.realizedPnlPercentage!, 5)
  })

  it('realized P&L in USD base is proportional to JPY base by USDJPY rate', async () => {
    const posJPY = await calculatePosition(usdClosedPos, null, 'JPY', makeJpyFxLookup())
    const posUSD = await calculatePosition(usdClosedPos, null, 'USD', emptyFxLookup)

    // Both use the same USD_JPY_HIST in my mock, so the ratio holds for both cost and proceeds
    expect(posJPY.costInJPY / posUSD.costInJPY!).toBeCloseTo(USD_JPY_HIST, 1)
    expect(posJPY.proceedsJPY! / posUSD.proceedsJPY!).toBeCloseTo(USD_JPY_HIST, 1)

    // P&L percentage should be the same (it divides out the FX rate)
    expect(posJPY.realizedPnlPercentage).toBeCloseTo(posUSD.realizedPnlPercentage!, 3)
  })
})

// ─── Portfolio aggregate invariants ──────────────────────────────────────────

describe('calculatePortfolioSummary — aggregate totals', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'log').mockImplementation(() => {})
    require('@portfolio/core/yahooFinanceApi').fetchHistoricalDividends.mockResolvedValue(null)
  })
  afterEach(() => jest.restoreAllMocks())

  it('totalPnlJPY === totalValueJPY − totalCostJPY', async () => {
    setupJpyBaseMocks({ 'AAPL': 120, '7203.T': 1700 })
    const summary = await calculatePortfolioSummary([usdOpenPos, jpyOpenPos], false, 'JPY')

    expect(summary.totalPnlJPY).toBeCloseTo(
      summary.totalValueJPY - summary.totalCostJPY, 5
    )
  })

  it('totalPnlPercentage === totalPnlJPY / totalCostJPY × 100', async () => {
    setupJpyBaseMocks({ 'AAPL': 120, '7203.T': 1700 })
    const summary = await calculatePortfolioSummary([usdOpenPos, jpyOpenPos], false, 'JPY')

    const expected = (summary.totalPnlJPY / summary.totalCostJPY) * 100
    expect(summary.totalPnlPercentage).toBeCloseTo(expected, 5)
  })

  it('totalValueJPY equals the sum of each position\'s currentValueJPY', async () => {
    setupJpyBaseMocks({ 'AAPL': 120, '7203.T': 1700 })
    const summary = await calculatePortfolioSummary([usdOpenPos, jpyOpenPos], false, 'JPY')

    const sumValue = summary.positions.reduce((s, p) => s + p.currentValueJPY, 0)
    expect(summary.totalValueJPY).toBeCloseTo(sumValue, 5)
  })

  it('totalCostJPY equals the sum of each position\'s costInJPY', async () => {
    setupJpyBaseMocks({ 'AAPL': 120, '7203.T': 1700 })
    const summary = await calculatePortfolioSummary([usdOpenPos, jpyOpenPos], false, 'JPY')

    const sumCost = summary.positions.reduce((s, p) => s + p.costInJPY, 0)
    expect(summary.totalCostJPY).toBeCloseTo(sumCost, 5)
  })

  it('totalDividendsJPY equals the sum of dividendIncomeJPY across all positions', async () => {
    setupJpyBaseMocks({ 'AAPL': 120, '7203.T': 1700 })
    const summary = await calculatePortfolioSummary([usdOpenPos, jpyOpenPos], false, 'JPY')

    const all = [...summary.positions, ...summary.closedPositions]
    const sumDiv = all.reduce((s, p) => s + p.dividendIncomeJPY, 0)
    expect(summary.totalDividendsJPY).toBeCloseTo(sumDiv, 5)
  })

  it('realizedPnlJPY equals the sum of closedPositions[i].realizedPnlJPY', async () => {
    setupJpyBaseMocks({ 'AAPL': 120 })
    const summary = await calculatePortfolioSummary([usdOpenPos, usdClosedPos], false, 'JPY')

    const sumRealized = summary.closedPositions.reduce((s, p) => s + (p.realizedPnlJPY ?? 0), 0)
    expect(summary.realizedPnlJPY).toBeCloseTo(sumRealized, 5)
  })

  it('realizedCostJPY equals the sum of closedPositions[i].costInJPY', async () => {
    setupJpyBaseMocks({ 'AAPL': 120 })
    const summary = await calculatePortfolioSummary([usdOpenPos, usdClosedPos], false, 'JPY')

    const sumCost = summary.closedPositions.reduce((s, p) => s + p.costInJPY, 0)
    expect(summary.realizedCostJPY).toBeCloseTo(sumCost, 5)
  })

  it('open positions are in summary.positions; closed positions are in summary.closedPositions', async () => {
    setupJpyBaseMocks({ 'AAPL': 120 })
    const summary = await calculatePortfolioSummary([usdOpenPos, usdClosedPos], false, 'JPY')

    expect(summary.positions.every(p => p.status === 'open')).toBe(true)
    expect(summary.closedPositions.every(p => p.status === 'closed')).toBe(true)
    expect(summary.positions.some(p => p.ticker === 'AAPL')).toBe(true)
    expect(summary.closedPositions.some(p => p.ticker === 'MSFT')).toBe(true)
  })

  it('empty portfolio returns all-zero summary', async () => {
    const summary = await calculatePortfolioSummary([], false, 'JPY')

    expect(summary.totalValueJPY).toBe(0)
    expect(summary.totalCostJPY).toBe(0)
    expect(summary.totalPnlJPY).toBe(0)
    expect(summary.totalPnlPercentage).toBe(0)
    expect(summary.totalDividendsJPY).toBe(0)
    expect(summary.positions).toHaveLength(0)
    expect(summary.closedPositions).toHaveLength(0)
  })
})

// ─── Currency switching ───────────────────────────────────────────────────────

describe('calculatePortfolioSummary — currency switching', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'log').mockImplementation(() => {})
    require('@portfolio/core/yahooFinanceApi').fetchHistoricalDividends.mockResolvedValue(null)
  })
  afterEach(() => jest.restoreAllMocks())

  it('USD stock: JPY-base total cost equals USD-base total cost × USD_JPY_HIST', async () => {
    // This is the core "currency not switching" bug test.
    // When baseCurrency changes from JPY to USD, totalCostJPY must change too.
    setupJpyBaseMocks({ 'AAPL': 120 })
    const jpySummary = await calculatePortfolioSummary([usdOpenPos], false, 'JPY')

    setupUsdBaseMocks({ 'AAPL': 120 })
    const usdSummary = await calculatePortfolioSummary([usdOpenPos], false, 'USD')

    // JPY cost = USD cost × USD_JPY_HIST  (historic rate used for cost conversion)
    expect(jpySummary.totalCostJPY).toBeCloseTo(usdSummary.totalCostJPY * USD_JPY_HIST, 0)
    // JPY value = USD value × USD_JPY_CURR  (current rate used for value conversion)
    expect(jpySummary.totalValueJPY).toBeCloseTo(usdSummary.totalValueJPY * USD_JPY_CURR, 0)
    // Sanity: the two summaries must have different numbers — currency did switch
    expect(jpySummary.totalCostJPY).not.toBeCloseTo(usdSummary.totalCostJPY, 0)
    expect(jpySummary.totalValueJPY).not.toBeCloseTo(usdSummary.totalValueJPY, 0)
  })

  it('JPY stock: USD-base total cost equals JPY-base total cost ÷ USD_JPY_HIST', async () => {
    setupJpyBaseMocks({ '7203.T': 1700 })
    const jpySummary = await calculatePortfolioSummary([jpyOpenPos], false, 'JPY')

    setupUsdBaseMocks({ '7203.T': 1700 })
    const usdSummary = await calculatePortfolioSummary([jpyOpenPos], false, 'USD')

    // USD cost = JPY cost / USD_JPY_HIST
    expect(usdSummary.totalCostJPY).toBeCloseTo(jpySummary.totalCostJPY / USD_JPY_HIST, 2)
    // USD value = JPY value / USD_JPY_CURR
    expect(usdSummary.totalValueJPY).toBeCloseTo(jpySummary.totalValueJPY / USD_JPY_CURR, 2)
    // Sanity: the two summaries must have different numbers
    expect(usdSummary.totalCostJPY).not.toBeCloseTo(jpySummary.totalCostJPY, 0)
  })

  it('USD stock: realizedPnlJPY scales correctly when base currency switches', async () => {
    setupJpyBaseMocks({})
    const jpySummary = await calculatePortfolioSummary([usdClosedPos], false, 'JPY')

    setupUsdBaseMocks({})
    const usdSummary = await calculatePortfolioSummary([usdClosedPos], false, 'USD')

    // Both sides use the same USD_JPY_HIST mock rate → ratio holds exactly
    expect(jpySummary.realizedPnlJPY / usdSummary.realizedPnlJPY).toBeCloseTo(USD_JPY_HIST, 1)
  })

  it('core invariant totalPnlJPY = totalValueJPY − totalCostJPY holds for every base currency', async () => {
    const cases: Array<[string, () => void]> = [
      ['JPY', () => setupJpyBaseMocks({ 'AAPL': 120 })],
      ['USD', () => setupUsdBaseMocks({ 'AAPL': 120 })],
    ]

    for (const [base, setup] of cases) {
      setup()
      const summary = await calculatePortfolioSummary([usdOpenPos], false, base)

      expect(summary.totalPnlJPY).toBeCloseTo(
        summary.totalValueJPY - summary.totalCostJPY, 5,
      )
    }
  })

  it('P&L percentage formula holds for every base currency', async () => {
    const cases: Array<[string, () => void]> = [
      ['JPY', () => setupJpyBaseMocks({ 'AAPL': 120 })],
      ['USD', () => setupUsdBaseMocks({ 'AAPL': 120 })],
    ]

    for (const [base, setup] of cases) {
      setup()
      const summary = await calculatePortfolioSummary([usdOpenPos], false, base)
      const expected = (summary.totalPnlJPY / summary.totalCostJPY) * 100
      expect(summary.totalPnlPercentage).toBeCloseTo(expected, 5)
    }
  })

  it('mixed portfolio: each position converts in its own currency pair', async () => {
    // USD stock AND JPY stock combined — verifies that separate FX lookups are
    // applied per position and that totals are correct sums.
    setupJpyBaseMocks({ 'AAPL': 120, '7203.T': 1700 })
    const summary = await calculatePortfolioSummary([usdOpenPos, jpyOpenPos], false, 'JPY')

    const aapl = summary.positions.find(p => p.ticker === 'AAPL')!
    const toyota = summary.positions.find(p => p.ticker === '7203.T')!

    // AAPL (USD): historical rate for cost, current rate for value
    expect(aapl.costInJPY).toBeCloseTo(100 * 10 * USD_JPY_HIST, 5)
    expect(aapl.currentValueJPY).toBeCloseTo(120 * 10 * USD_JPY_CURR, 5)

    // Toyota (JPY): no conversion
    expect(toyota.costInJPY).toBe(1500 * 500)
    expect(toyota.currentValueJPY).toBe(1700 * 500)

    // Portfolio totals are exact sums
    expect(summary.totalCostJPY).toBeCloseTo(aapl.costInJPY + toyota.costInJPY, 5)
    expect(summary.totalValueJPY).toBeCloseTo(aapl.currentValueJPY + toyota.currentValueJPY, 5)
  })
})

// ─── PortfolioSummary component — P&L breakdown ───────────────────────────────

describe('PortfolioSummary component — P&L breakdown reconciliation', () => {
  /**
   * Re-implements the derivation from PortfolioSummary.tsx so we can verify
   * the math against hand-crafted PortfolioSummary objects without rendering
   * the React component.
   *
   * Source (PortfolioSummary.tsx):
   *   const closedLotDividends = summary.closedPositions.reduce(...)
   *   const unrealized    = summary.totalPnlJPY
   *   const dividends     = summary.totalDividendsJPY
   *   const realizedSales = summary.realizedPnlJPY - closedLotDividends
   *   const totalPnlAbsolute  = unrealized + dividends + realizedSales
   *   const totalCostDeployed = summary.totalCostJPY + summary.realizedCostJPY
   *   const totalPnlPct = totalCostDeployed === 0 ? 0 : totalPnlAbsolute / totalCostDeployed * 100
   */
  function computeBreakdown(summary: PortfolioSummaryType) {
    const closedLotDividends = summary.closedPositions
      .reduce((s, p) => s + (p.dividendIncomeJPY ?? 0), 0)
    const unrealized = summary.totalPnlJPY
    const dividends = summary.totalDividendsJPY
    const realizedSales = summary.realizedPnlJPY - closedLotDividends
    const totalPnlAbsolute = unrealized + dividends + realizedSales
    const totalCostDeployed = summary.totalCostJPY + summary.realizedCostJPY
    const totalPnlPct = totalCostDeployed === 0
      ? 0
      : (totalPnlAbsolute / totalCostDeployed) * 100
    return { closedLotDividends, unrealized, dividends, realizedSales, totalPnlAbsolute, totalCostDeployed, totalPnlPct }
  }

  it('breakdown chips sum to totalPnlAbsolute', () => {
    const summary: PortfolioSummaryType = {
      totalValueJPY: 200_000,
      totalCostJPY: 170_000,
      totalPnlJPY: 30_000,
      totalPnlPercentage: 17.65,
      positions: [],
      closedPositions: [],
      realizedPnlJPY: 8_000,
      realizedCostJPY: 50_000,
      realizedPnlPercentage: 16,
      totalDividendsJPY: 3_000,
    }

    const { unrealized, dividends, realizedSales, totalPnlAbsolute } = computeBreakdown(summary)

    expect(unrealized + dividends + realizedSales).toBeCloseTo(totalPnlAbsolute, 5)
  })

  it('unrealized chip equals summary.totalPnlJPY', () => {
    const summary: PortfolioSummaryType = {
      totalValueJPY: 500_000,
      totalCostJPY: 450_000,
      totalPnlJPY: 50_000,
      totalPnlPercentage: 11.11,
      positions: [],
      closedPositions: [],
      realizedPnlJPY: 0,
      realizedCostJPY: 0,
      realizedPnlPercentage: 0,
      totalDividendsJPY: 0,
    }

    const { unrealized } = computeBreakdown(summary)
    expect(unrealized).toBe(summary.totalPnlJPY)
  })

  it('realizedSales chip excludes dividends earned on closed lots (no double-counting)', () => {
    // A closed position that earned 5 000 JPY in dividends while held.
    // realizedPnlJPY (= 70 000) folds in those dividends; the breakdown must
    // subtract them so dividends are only counted once in the dividends chip.
    const closedDividend = 5_000
    const saleGain = 65_000 // actual gain from selling (excluding dividends)

    const closedPos: Position = {
      status: 'closed',
      transactionDate: TX_DATE,
      ticker: 'MSFT',
      fullName: 'Microsoft',
      account: 'US',
      quantity: 10,
      costPerUnit: 200,
      transactionCcy: 'USD',
      stockCcy: 'USD',
      saleDate: SALE_DATE,
      salePricePerUnit: 250,
      saleCcy: 'USD',
      costInJPY: 260_000,
      currentValueJPY: 0,
      pnlJPY: 0,
      pnlPercentage: 0,
      transactionFxRate: USD_JPY_HIST,
      currentFxRate: 1,
      dividendIncomeJPY: closedDividend,
      totalReturnPercentage: 0,
      realizedPnlJPY: saleGain + closedDividend,
      realizedPnlPercentage: 0,
      proceedsJPY: 325_000,
    }

    const summary: PortfolioSummaryType = {
      totalValueJPY: 0,
      totalCostJPY: 0,
      totalPnlJPY: 0,
      totalPnlPercentage: 0,
      positions: [],
      closedPositions: [closedPos],
      realizedPnlJPY: saleGain + closedDividend,
      realizedCostJPY: 260_000,
      realizedPnlPercentage: 0,
      totalDividendsJPY: closedDividend,
    }

    const { realizedSales, dividends, totalPnlAbsolute } = computeBreakdown(summary)

    // Dividends chip owns all dividends
    expect(dividends).toBe(closedDividend)
    // Realized sales chip = sale gain only, not inflated by dividends
    expect(realizedSales).toBeCloseTo(saleGain, 5)
    // Together they sum to the correct total
    expect(totalPnlAbsolute).toBeCloseTo(saleGain + closedDividend, 5)
  })

  it('totalPnlPct = totalPnlAbsolute / (totalCostJPY + realizedCostJPY) × 100', () => {
    const summary: PortfolioSummaryType = {
      totalValueJPY: 200_000,
      totalCostJPY: 170_000,
      totalPnlJPY: 30_000,
      totalPnlPercentage: 17.65,
      positions: [],
      closedPositions: [],
      realizedPnlJPY: 10_000,
      realizedCostJPY: 60_000,
      realizedPnlPercentage: 16.67,
      totalDividendsJPY: 2_500,
    }

    const { totalPnlAbsolute, totalCostDeployed, totalPnlPct } = computeBreakdown(summary)

    const expected = (totalPnlAbsolute / totalCostDeployed) * 100
    expect(totalPnlPct).toBeCloseTo(expected, 5)
  })

  it('totalPnlPct is 0 when totalCostDeployed is 0 (no division by zero)', () => {
    const summary: PortfolioSummaryType = {
      totalValueJPY: 0,
      totalCostJPY: 0,
      totalPnlJPY: 0,
      totalPnlPercentage: 0,
      positions: [],
      closedPositions: [],
      realizedPnlJPY: 0,
      realizedCostJPY: 0,
      realizedPnlPercentage: 0,
      totalDividendsJPY: 0,
    }

    const { totalPnlPct } = computeBreakdown(summary)
    expect(totalPnlPct).toBe(0)
  })

  it('deployed cost uses open + closed cost bases', () => {
    const summary: PortfolioSummaryType = {
      totalValueJPY: 200_000,
      totalCostJPY: 150_000,   // open lots cost basis
      totalPnlJPY: 50_000,
      totalPnlPercentage: 33.33,
      positions: [],
      closedPositions: [],
      realizedPnlJPY: 5_000,
      realizedCostJPY: 80_000, // closed lots cost basis
      realizedPnlPercentage: 6.25,
      totalDividendsJPY: 1_000,
    }

    const { totalCostDeployed } = computeBreakdown(summary)
    expect(totalCostDeployed).toBe(summary.totalCostJPY + summary.realizedCostJPY)
  })
})
