import { getDbClient } from '../config';

export interface HistoricalDataStatus {
  needsRefresh: boolean;
  missingDays: number;
  lastDataDate: string | null;
  reason: string;
}

const getExpectedMissingDays = (today: Date, lastDate: Date): number => {
  const todayDay = today.getDay();
  const lastDay = lastDate.getDay();

  if (todayDay === 1 && lastDay === 5) {
    return 2; // Monday after Friday
  }

  if (todayDay === 2 && lastDay === 5) {
    return 3; // Tuesday after Friday
  }

  return 0;
};

export const getHistoricalDataStatus = async (): Promise<HistoricalDataStatus> => {
  try {
    const client = getDbClient();

    const recentPriceResult = await client.execute(`
      SELECT MAX(price_date) as latest_date
      FROM securities_prices
    `);

    const lastDataDate = recentPriceResult.rows[0]?.latest_date as string | null;

    if (!lastDataDate) {
      return {
        needsRefresh: true,
        missingDays: 0,
        lastDataDate: null,
        reason: 'No historical data found'
      };
    }

    const lastDate = new Date(lastDataDate);
    const today = new Date();

    today.setHours(0, 0, 0, 0);
    lastDate.setHours(0, 0, 0, 0);

    const diffTime = today.getTime() - lastDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    const expectedMissingDays = getExpectedMissingDays(today, lastDate);
    const unexpectedMissingDays = diffDays - expectedMissingDays;

    const todayDay = today.getDay();
    const isWeekday = todayDay >= 1 && todayDay <= 5;
    const needsRefresh = unexpectedMissingDays > 1 || (isWeekday && diffDays > expectedMissingDays);

    let reason: string;
    if (!needsRefresh) {
      reason = `Data is up to date (last: ${lastDataDate})`;
    } else if (diffDays === expectedMissingDays) {
      reason = `Missing ${diffDays} days (expected due to weekends)`;
    } else {
      reason = `Missing ${diffDays} days (${unexpectedMissingDays} unexpected)`;
    }

    return {
      needsRefresh,
      missingDays: diffDays,
      lastDataDate,
      reason
    };
  } catch (error) {
    console.error('Error checking historical data status:', error);
    return {
      needsRefresh: true,
      missingDays: 0,
      lastDataDate: null,
      reason: 'Error checking data status'
    };
  }
};
