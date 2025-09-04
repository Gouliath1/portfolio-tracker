import React from 'react';

interface ChartStateProps {
    height?: string;
}

export const LoadingState: React.FC<ChartStateProps> = ({ height = 'h-full' }) => (
    <div className={`flex items-center justify-center ${height} text-gray-500`}>
        <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <p>Calculating historical portfolio data...</p>
        </div>
    </div>
);

export const ErrorState: React.FC<ChartStateProps & { error: string }> = ({ 
    height = 'h-full', 
    error 
}) => (
    <div className={`flex items-center justify-center ${height} text-red-500`}>
        <div className="text-center">
            <p className="font-medium">Error loading chart data</p>
            <p className="text-sm">{error}</p>
        </div>
    </div>
);

export const NoDataState: React.FC<ChartStateProps> = ({ height = 'h-full' }) => (
    <div className={`flex items-center justify-center ${height} text-gray-500`}>
        <p>No data available for the selected time period</p>
    </div>
);
