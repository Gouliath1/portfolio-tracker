import { Position, RawPosition, PortfolioSummary } from '@portfolio/types';
export declare const calculatePosition: (rawPosition: RawPosition, currentPrice: number | null) => Promise<Position>;
export declare const calculatePortfolioSummary: (rawPositions: RawPosition[], forceRefresh?: boolean) => Promise<PortfolioSummary>;
