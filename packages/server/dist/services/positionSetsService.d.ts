import { RawPosition } from '@portfolio/types';
import { PositionSet } from '../database/operations/positionSetOperations';
export interface PositionSetsOverview {
    positionSets: PositionSet[];
    activeSet: PositionSet | null;
}
export interface PositionSetExport {
    positionSet: {
        name: string;
        display_name: string;
        description: string | null;
        created_at: string;
    };
    positions: RawPosition[];
}
export interface ImportPositionSetPayload {
    name: string;
    description?: string;
    positions: RawPosition[];
    setAsActive?: boolean;
}
export interface ImportPositionSetResult {
    positionSetId: number;
    positionsImported: number;
}
export declare const getPositionSetsOverview: () => Promise<PositionSetsOverview>;
export declare const activatePositionSetById: (positionSetId: number) => Promise<void>;
export declare const deletePositionSetById: (positionSetId: number) => Promise<void>;
export declare const exportPositionSetById: (positionSetId: number) => Promise<PositionSetExport>;
export declare const importPositionSetData: (payload: ImportPositionSetPayload) => Promise<ImportPositionSetResult>;
