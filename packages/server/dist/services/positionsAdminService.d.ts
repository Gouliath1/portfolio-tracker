import { RawPosition } from '@portfolio/types';
export interface PositionsFileStatus {
    hasFile: boolean;
    positionCount: number;
    message: string;
}
export interface PositionsImportResult {
    count: number;
    positions: RawPosition[];
}
export declare const readPositionsFromFile: (filePath?: string) => Promise<RawPosition[]>;
export interface UpsertPositionsOptions {
    replaceExisting?: boolean;
}
export declare const upsertPositionsForSet: (positionSetId: number, positions: RawPosition[], options?: UpsertPositionsOptions) => Promise<number>;
export declare const replaceActivePositionSetPositions: (positions: RawPosition[]) => Promise<number>;
export declare const importPositionsFromFile: (filePath?: string) => Promise<PositionsImportResult>;
export declare const getPositionsFileStatus: (filePath?: string) => Promise<PositionsFileStatus>;
export declare const writePositionsFile: (positions: RawPosition[], filePath?: string) => Promise<void>;
