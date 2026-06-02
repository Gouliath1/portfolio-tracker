/**
 * Unit tests for currency utilities
 */

import {
  SUPPORTED_CURRENCIES,
  getCurrencySymbol,
  formatCurrencyValue,
  getCurrencyPair
} from '@portfolio/core'

describe('Currency Utils', () => {
  describe('SUPPORTED_CURRENCIES', () => {
    it('should contain expected currencies', () => {
      const codes = SUPPORTED_CURRENCIES.map(c => c.code)
      
      expect(codes).toContain('JPY')
      expect(codes).toContain('USD')
      expect(codes).toContain('EUR')
      expect(codes).toContain('GBP')
      expect(codes).toContain('CHF')
      expect(codes).toContain('CAD')
      expect(codes).toContain('AUD')
      expect(codes).toContain('HKD')
      expect(codes).toContain('SGD')
      expect(codes).toContain('KRW')
      expect(codes).toContain('CNY')
    })

    it('should have complete currency information', () => {
      SUPPORTED_CURRENCIES.forEach(currency => {
        expect(currency).toHaveProperty('code')
        expect(currency).toHaveProperty('name')
        expect(currency).toHaveProperty('symbol')
        expect(typeof currency.code).toBe('string')
        expect(typeof currency.name).toBe('string')
        expect(typeof currency.symbol).toBe('string')
        expect(currency.code.length).toBe(3)
      })
    })
  })

  // NOTE: DEFAULT_FX_RATES / getDefaultFxRate were removed when the app moved
  // to live Yahoo FX rates (no hardcoded defaults). Their tests were dropped.

  describe('getCurrencySymbol', () => {
    it('should return correct symbols for supported currencies', () => {
      expect(getCurrencySymbol('JPY')).toBe('¥')
      expect(getCurrencySymbol('USD')).toBe('$')
      expect(getCurrencySymbol('EUR')).toBe('€')
      expect(getCurrencySymbol('GBP')).toBe('£')
      expect(getCurrencySymbol('CHF')).toBe('CHF')
    })

    it('should return currency code for unsupported currencies', () => {
      expect(getCurrencySymbol('XXX')).toBe('XXX')
      expect(getCurrencySymbol('INVALID')).toBe('INVALID')
      expect(getCurrencySymbol('')).toBe('')
    })

    it('should handle case sensitivity', () => {
      expect(getCurrencySymbol('usd')).toBe('usd') // lowercase not found
      expect(getCurrencySymbol('USD')).toBe('$')
    })
  })

  describe('formatCurrencyValue', () => {
    it('should format JPY correctly (no decimals)', () => {
      expect(formatCurrencyValue(1000, 'JPY')).toBe('¥1,000')
      expect(formatCurrencyValue(1234567, 'JPY')).toBe('¥1,234,567')
      expect(formatCurrencyValue(0, 'JPY')).toBe('¥0')
    })

    it('should format KRW correctly (no decimals)', () => {
      expect(formatCurrencyValue(1000, 'KRW')).toBe('₩1,000')
      expect(formatCurrencyValue(1234567, 'KRW')).toBe('₩1,234,567')
    })

    it('should format USD correctly (with decimals)', () => {
      expect(formatCurrencyValue(1000.50, 'USD')).toBe('$1,000.50')
      expect(formatCurrencyValue(1234567.89, 'USD')).toBe('$1,234,567.89')
      expect(formatCurrencyValue(0, 'USD')).toBe('$0.00')
    })

    it('should format EUR correctly (with decimals)', () => {
      expect(formatCurrencyValue(1000.50, 'EUR')).toBe('€1,000.50')
      expect(formatCurrencyValue(1234567.89, 'EUR')).toBe('€1,234,567.89')
    })

    it('should handle negative values', () => {
      expect(formatCurrencyValue(-1000, 'JPY')).toBe('¥-1,000')
      expect(formatCurrencyValue(-1000.50, 'USD')).toBe('$-1,000.50')
    })

    it('should handle zero values', () => {
      expect(formatCurrencyValue(0, 'JPY')).toBe('¥0')
      expect(formatCurrencyValue(0, 'USD')).toBe('$0.00')
    })

    it('should handle unsupported currencies', () => {
      expect(formatCurrencyValue(1000, 'XXX')).toBe('XXX1,000.00')
      expect(formatCurrencyValue(1000, 'INVALID')).toBe('INVALID1,000.00')
    })

    it('should handle edge cases', () => {
      expect(formatCurrencyValue(0.01, 'USD')).toBe('$0.01')
      expect(formatCurrencyValue(0.99, 'USD')).toBe('$0.99')
      expect(formatCurrencyValue(999999999.99, 'USD')).toBe('$999,999,999.99')
    })
  })

  describe('getCurrencyPair', () => {
    it('should return correct currency pairs', () => {
      expect(getCurrencyPair('USD')).toBe('USDJPY')
      expect(getCurrencyPair('EUR')).toBe('EURJPY')
      expect(getCurrencyPair('USD', 'EUR')).toBe('USDEUR')
    })

    it('should return empty string for same currencies', () => {
      expect(getCurrencyPair('JPY')).toBe('')
      expect(getCurrencyPair('JPY', 'JPY')).toBe('')
      expect(getCurrencyPair('USD', 'USD')).toBe('')
    })

    it('should handle custom target currency', () => {
      expect(getCurrencyPair('USD', 'EUR')).toBe('USDEUR')
      expect(getCurrencyPair('GBP', 'CHF')).toBe('GBPCHF')
    })
  })
})
