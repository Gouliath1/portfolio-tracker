import {
  createChartData,
} from '../src/charting/chartData';
import {
  TimelineFilter,
  generateDateIntervals,
  getTransactionsNearDate,
  getIntervalForTimeline,
  TIMELINE_BUTTONS,
} from '../src/charting/chartUtils';
import { Position } from '@portfolio/types';
import { HistoricalSnapshot } from '../src/historicalPortfolioCalculations';

const createPosition = (overrides: Partial<Position> = {}): Position => ({
  transactionDate: '2024-01-03T09:00:00.000Z',
  ticker: 'AAPL',
  fullName: 'Apple Inc.',
  broker: 'Rakuten',
  account: 'General',
  quantity: 10,
  costPerUnit: 1000,
  transactionCcy: 'USD',
  stockCcy: 'USD',
  currentPrice: 1200,
  costInJPY: 10000,
  currentValueJPY: 12000,
  pnlJPY: 2000,
  pnlPercentage: 0.2,
  transactionFxRate: 110,
  currentFxRate: 110,
  ...overrides,
});

const createSnapshot = (overrides: Partial<HistoricalSnapshot> = {}): HistoricalSnapshot => ({
  date: new Date('2024-01-01T00:00:00.000Z'),
  totalValueJPY: 100,
  totalCostJPY: 80,
  pnlJPY: 20,
  pnlPercentage: 0.25,
  positionsCount: 1,
  cumulativePnlJPY: 20,
  cumulativePnlPercentage: 0.25,
  ...overrides,
});

describe('charting utilities', () => {
  const fixedNow = new Date('2024-01-10T12:00:00.000Z');
  const basePositions: Position[] = [
    createPosition({ transactionDate: '2023-12-15T09:15:00.000Z', ticker: 'MSFT' }),
    createPosition({ transactionDate: '2024-01-08T10:00:00.000Z', ticker: 'AAPL' }),
  ];

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(fixedNow);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('exposes timeline filters with labels for the UI', () => {
    const keys = TIMELINE_BUTTONS.map(button => button.key);
    expect(keys).toContain('1D');
    expect(keys).toContain('All');
    const labels = new Set(TIMELINE_BUTTONS.map(button => button.label));
    expect(labels.has('1D')).toBe(true);
    expect(labels.has('All')).toBe(true);
  });

  it('generates hourly intervals for the 1D timeline', () => {
    const intervals = generateDateIntervals('1D', basePositions);
    expect(intervals[0].toISOString()).toBe('2024-01-09T12:00:00.000Z');
    expect(intervals.at(-1)?.toISOString()).toBe('2024-01-10T12:00:00.000Z');
    expect(intervals.length).toBeGreaterThan(20);
  });

  it('uses the earliest position date for the All timeline', () => {
    const intervals = generateDateIntervals('All', basePositions);
    expect(intervals[0].toISOString()).toBe('2023-12-15T09:15:00.000Z');
    expect(intervals.at(-1)?.toISOString()).toBe('2024-01-10T12:00:00.000Z');
  });

  it('finds transactions near an interval midpoint', () => {
    const timeline: TimelineFilter = '1M';
    const intervalMs = getIntervalForTimeline(timeline);
    const target = new Date('2024-01-08T12:00:00.000Z');
    const positions: Position[] = [
      createPosition({ transactionDate: '2024-01-08T01:00:00.000Z', ticker: 'AAPL' }),
      createPosition({ transactionDate: '2024-01-08T18:30:00.000Z', ticker: 'MSFT' }),
      createPosition({ transactionDate: '2023-12-01T12:00:00.000Z', ticker: 'NVDA' }),
    ];

    const matches = getTransactionsNearDate(positions, target, intervalMs);
    expect(matches).toHaveLength(2);
    expect(matches.map(pos => pos.ticker)).toEqual(['AAPL', 'MSFT']);
  });

  it('builds chart datasets that flag transaction dates', () => {
    const dateIntervals = [
      new Date('2024-01-08T10:00:00.000Z'),
      new Date('2024-01-09T10:00:00.000Z'),
    ];
    const snapshots: HistoricalSnapshot[] = [
      createSnapshot({
        date: dateIntervals[0],
        totalValueJPY: 120000,
        totalCostJPY: 100000,
        pnlJPY: 20000,
        pnlPercentage: 0.2,
      }),
      createSnapshot({
        date: dateIntervals[1],
        totalValueJPY: 125000,
        totalCostJPY: 100000,
        pnlJPY: 25000,
        pnlPercentage: 0.25,
      }),
    ];

    const chartData = createChartData(
      dateIntervals,
      snapshots,
      basePositions,
      '1M',
      true
    );

    expect(chartData.labels).toEqual([
      'Jan 8',
      'Jan 9',
    ]);

    const [valueDataset, costDataset, pnlDataset] = chartData.datasets;
    expect(valueDataset.data).toEqual([120000, 125000]);
    expect(costDataset.data).toEqual([100000, 100000]);
    expect(pnlDataset.data).toEqual([20000, 25000]);

    // First interval has transactions so the chart should emphasize that point
    expect(valueDataset.pointRadius({ dataIndex: 0 })).toBe(4);
    expect(valueDataset.pointRadius({ dataIndex: 1 })).toBe(0);
  });

  it('switches to percentage mode when values are hidden', () => {
    const dateIntervals = [new Date('2024-01-08T10:00:00.000Z')];
    const snapshots: HistoricalSnapshot[] = [
      createSnapshot({
        date: dateIntervals[0],
        pnlPercentage: 0.2,
        pnlJPY: 20000,
      }),
    ];

    const chartData = createChartData(
      dateIntervals,
      snapshots,
      basePositions,
      '1M',
      false
    );

    const [valueDataset, costDataset, pnlDataset] = chartData.datasets;
    expect(valueDataset.hidden).toBe(true);
    expect(costDataset.hidden).toBe(true);
    expect(pnlDataset.yAxisID).toBe('y');
    expect(pnlDataset.data).toEqual([0.2]);
  });
});
