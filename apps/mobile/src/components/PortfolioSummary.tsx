import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { PortfolioSnapshot } from '@portfolio/types';

interface PortfolioSummaryProps {
  snapshot: PortfolioSnapshot;
  showValues?: boolean;
}

interface SummaryCardProps {
  title: string;
  value: string;
  subtitle?: string;
  isPositive?: boolean;
  isNeutral?: boolean;
}

function SummaryCard({ title, value, subtitle, isPositive, isNeutral }: SummaryCardProps) {
  const valueColor = isNeutral
    ? '#333'
    : isPositive
      ? '#16a34a'
      : '#dc2626';

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={[styles.cardValue, { color: valueColor }]}>
        {value}
      </Text>
      {subtitle && (
        <Text style={styles.cardSubtitle}>{subtitle}</Text>
      )}
    </View>
  );
}

function formatCurrency(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value)) {
    return '$0.00';
  }
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch (error) {
    console.warn('[PortfolioSummary] Error formatting currency:', error);
    return '$0.00';
  }
}

function formatPercent(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value)) {
    return '0.00%';
  }
  try {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  } catch (error) {
    console.warn('[PortfolioSummary] Error formatting percent:', error);
    return '0.00%';
  }
}

export function PortfolioSummary({ snapshot, showValues = true }: PortfolioSummaryProps) {
  // Gracefully handle missing or invalid snapshot data
  if (!snapshot || !snapshot.summary) {
    console.warn('[PortfolioSummary] Invalid snapshot data, displaying zeros');
    return (
      <View style={styles.container}>
        <View style={styles.row}>
          <SummaryCard title="Total Value" value="$0.00" isNeutral />
          <SummaryCard title="Total P&L" value="$0.00" subtitle="0.00%" isPositive />
        </View>
        <View style={styles.row}>
          <SummaryCard title="Total Cost" value="$0.00" isNeutral />
          <SummaryCard title="P&L %" value="0.00%" isPositive />
        </View>
      </View>
    );
  }

  const { summary } = snapshot;

  // Use optional chaining and provide defaults for all values
  const totalValue = showValues ? formatCurrency(summary?.totalValueJPY ?? 0) : '***';
  const totalPnl = showValues ? formatCurrency(summary?.totalPnlJPY ?? 0) : '***';
  const totalCost = showValues ? formatCurrency(summary?.totalCostJPY ?? 0) : '***';
  const pnlPercent = showValues ? formatPercent(summary?.totalPnlPercentage ?? 0) : '***';

  const isPnlPositive = (summary?.totalPnlJPY ?? 0) >= 0;
  const isPercentPositive = (summary?.totalPnlPercentage ?? 0) >= 0;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <SummaryCard
          title="Total Value"
          value={totalValue}
          isNeutral
        />
        <SummaryCard
          title="Total P&L"
          value={totalPnl}
          subtitle={showValues ? pnlPercent : undefined}
          isPositive={isPnlPositive}
        />
      </View>
      <View style={styles.row}>
        <SummaryCard
          title="Total Cost"
          value={totalCost}
          isNeutral
        />
        <SummaryCard
          title="P&L %"
          value={pnlPercent}
          isPositive={isPercentPositive}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 12,
  },
  card: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 8,
    fontWeight: '500',
  },
  cardValue: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#6b7280',
  },
});
