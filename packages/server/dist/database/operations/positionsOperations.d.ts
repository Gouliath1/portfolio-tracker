import { RawPosition } from '@portfolio/types';
export declare const getPositionsForSet: (positionSetId: number) => Promise<RawPosition[]>;
export declare const getPositionsForActiveSet: () => Promise<RawPosition[]>;
