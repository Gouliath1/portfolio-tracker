import { mockPositions } from '../data/positions';
import { calculatePortfolioSummary } from '../utils/calculations';
import { PortfolioSummary } from '../components/PortfolioSummary';
import { PerformanceChart } from '../components/PerformanceChart';
import { PositionsTable } from '../components/PositionsTable';

export default function Home() {
  const portfolioSummary = calculatePortfolioSummary(mockPositions);

  return (
    <main className="min-h-screen p-8 bg-gray-100">
      <h1 className="text-3xl font-bold mb-8">Portfolio Tracker</h1>
      <PortfolioSummary summary={portfolioSummary} />
      <div className="mb-8">
        <PerformanceChart positions={mockPositions} />
      </div>
      <PositionsTable positions={mockPositions} />
    </main>
  );
}
