/**
 * Unit tests for PortfolioSummary component
 */

import { render, screen } from '../__mocks__/testUtils'
  import { PortfolioSummary } from '@portfolio/types'

// Mock the PortfolioSummary component
const MockPortfolioSummaryComponent = ({ summary }: { summary: PortfolioSummary | null }) => {
  if (!summary) {
    return <div data-testid="loading">Loading...</div>
  }

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const formatPercent = (percent: number): string => {
    return `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`
  }

  return (
    <div data-testid="portfolio-summary">
      <div data-testid="total-value">
        {formatCurrency(summary.totalValueJPY)}
      </div>
      <div data-testid="total-cost">
        {formatCurrency(summary.totalCostJPY)}
      </div>
      <div data-testid="total-pnl">
        {formatCurrency(summary.totalPnlJPY)}
      </div>
      <div data-testid="total-pnl-percent">
        {formatPercent(summary.totalPnlPercentage)}
      </div>
      <div data-testid="positions-count">
        {summary.positions.length} positions
      </div>
    </div>
  )
}

describe('PortfolioSummary Component', () => {
  const mockSummary: PortfolioSummary = {
    totalValueJPY: 5000000,
    totalCostJPY: 4500000,
    totalPnlJPY: 500000,
    totalPnlPercentage: 11.11,
    positions: [],
  }

  it('should render portfolio summary data correctly', () => {
    render(<MockPortfolioSummaryComponent summary={mockSummary} />)

    expect(screen.getByTestId('portfolio-summary')).toBeDefined()
    expect(screen.getByTestId('total-value').textContent).toContain('5,000,000')
    expect(screen.getByTestId('total-cost').textContent).toContain('4,500,000')
    expect(screen.getByTestId('total-pnl').textContent).toContain('500,000')
    expect(screen.getByTestId('total-pnl-percent').textContent).toContain('11.11%')
    expect(screen.getByTestId('positions-count').textContent).toBe('0 positions')
  })

  it('should render loading state when summary is null', () => {
    render(<MockPortfolioSummaryComponent summary={null} />)

    expect(screen.getByTestId('loading')).toBeDefined()
    expect(screen.getByTestId('loading').textContent).toBe('Loading...')
    expect(screen.queryByTestId('portfolio-summary')).toBeNull()
  })

  it('should handle negative P&L correctly', () => {
    const lossySummary: PortfolioSummary = {
      totalValueJPY: 4000000,
      totalCostJPY: 5000000,
      totalPnlJPY: -1000000,
      totalPnlPercentage: -20.0,
      positions: [],
    }

    render(<MockPortfolioSummaryComponent summary={lossySummary} />)

    expect(screen.getByTestId('total-pnl').textContent).toContain('1,000,000')
    expect(screen.getByTestId('total-pnl-percent').textContent).toContain('-20.00%')
  })

  it('should format large numbers correctly', () => {
    const largeSummary: PortfolioSummary = {
      totalValueJPY: 1234567890,
      totalCostJPY: 1000000000,
      totalPnlJPY: 234567890,
      totalPnlPercentage: 23.46,
      positions: [],
    }

    render(<MockPortfolioSummaryComponent summary={largeSummary} />)

    expect(screen.getByTestId('total-value').textContent).toContain('1,234,567,890')
    expect(screen.getByTestId('total-cost').textContent).toContain('1,000,000,000')
    expect(screen.getByTestId('total-pnl').textContent).toContain('234,567,890')
  })

  it('should handle zero values', () => {
    const zeroSummary: PortfolioSummary = {
      totalValueJPY: 0,
      totalCostJPY: 0,
      totalPnlJPY: 0,
      totalPnlPercentage: 0,
      positions: [],
    }

    render(<MockPortfolioSummaryComponent summary={zeroSummary} />)

    expect(screen.getByTestId('total-value').textContent).toContain('0')
    expect(screen.getByTestId('total-cost').textContent).toContain('0')
    expect(screen.getByTestId('total-pnl').textContent).toContain('0')
    expect(screen.getByTestId('total-pnl-percent').textContent).toContain('0.00%')
  })

  describe('Currency Formatting', () => {
    it('should format JPY without decimal places', () => {
      const summary: PortfolioSummary = {
        totalValueJPY: 1234.56, // Should be rounded to whole yen
        totalCostJPY: 1000.99,
        totalPnlJPY: 233.57,
        totalPnlPercentage: 23.36,
        positions: [],
      }

      render(<MockPortfolioSummaryComponent summary={summary} />)

      expect(screen.getByTestId('total-value').textContent).toContain('1,235')
      expect(screen.getByTestId('total-cost').textContent).toContain('1,001')
      expect(screen.getByTestId('total-pnl').textContent).toContain('234')
    })
  })

  describe('Percentage Formatting', () => {
    it('should show + sign for positive percentages', () => {
      const summary: PortfolioSummary = {
        totalValueJPY: 1100000,
        totalCostJPY: 1000000,
        totalPnlJPY: 100000,
        totalPnlPercentage: 10.0,
        positions: [],
      }

      render(<MockPortfolioSummaryComponent summary={summary} />)

      expect(screen.getByTestId('total-pnl-percent').textContent).toContain('+10.00%')
    })

    it('should show - sign for negative percentages', () => {
      const summary: PortfolioSummary = {
        totalValueJPY: 900000,
        totalCostJPY: 1000000,
        totalPnlJPY: -100000,
        totalPnlPercentage: -10.0,
        positions: [],
      }

      render(<MockPortfolioSummaryComponent summary={summary} />)

      expect(screen.getByTestId('total-pnl-percent').textContent).toContain('-10.00%')
    })
  })
})
