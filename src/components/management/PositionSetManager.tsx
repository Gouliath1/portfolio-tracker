import React, { useState, useEffect } from 'react';

// Icon components as inline SVGs
const LoaderIcon = ({ className }: { className?: string }) => (
  <svg className={`animate-spin ${className}`} viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

const PlusIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const AlertIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5C2.962 17.333 3.924 19 5.464 19z" />
  </svg>
);

const CheckIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const PlayIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1.586a1 1 0 01.707.293l2.414 2.414a1 1 0 00.707.293H15M9 10v4a2 2 0 002 2h2a2 2 0 002-2v-4M9 10V9a2 2 0 012-2h2a2 2 0 012 2v1" />
  </svg>
);

const DownloadIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const TrashIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const SettingsIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

interface PositionSet {
  id: number;
  name: string;
  display_name: string;
  description: string | null;
  info_type: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface PositionSetsResponse {
  position_sets: PositionSet[];
  active_set: PositionSet | null;
}

interface PositionSetManagerProps {
  onPositionSetChanged?: () => void;
}

const PositionSetManager: React.FC<PositionSetManagerProps> = ({ onPositionSetChanged }) => {
  const [positionSets, setPositionSets] = useState<PositionSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [operationLoading, setOperationLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showImportForm, setShowImportForm] = useState(false);
  const [importData, setImportData] = useState({
    name: '',
    description: '',
    set_as_active: false
  });

  const fetchPositionSets = async () => {
    try {
      const response = await fetch('/api/position-sets');
      if (!response.ok) throw new Error('Failed to fetch position sets');
      
      const data: PositionSetsResponse = await response.json();
      setPositionSets(data.position_sets);
    } catch (err) {
      setError('Failed to load position sets');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPositionSets();
  }, []);

  // Auto-hide success messages after 4 seconds
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        setSuccess(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  const handleActivateSet = async (setId: number) => {
    setOperationLoading(`activate-${setId}`);
    try {
      const response = await fetch(`/api/position-sets/${setId}/activate`, {
        method: 'POST'
      });
      
      if (!response.ok) throw new Error('Failed to activate position set');
      
      setSuccess('Position set activated successfully');
      await fetchPositionSets();
      onPositionSetChanged?.();
    } catch (err) {
      setError('Failed to activate position set');
      console.error(err);
    } finally {
      setOperationLoading(null);
    }
  };

  const handleDeleteSet = async (setId: number, setName: string) => {
    if (!confirm(`Are you sure you want to delete "${setName}"? This will permanently remove all positions in this set.`)) {
      return;
    }

    setOperationLoading(`delete-${setId}`);
    try {
      const response = await fetch(`/api/position-sets/${setId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete position set');
      }
      
      setSuccess('Position set deleted successfully');
      await fetchPositionSets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete position set');
      console.error(err);
    } finally {
      setOperationLoading(null);
    }
  };

  const handleExportSet = async (setId: number) => {
    setOperationLoading(`export-${setId}`);
    try {
      const response = await fetch(`/api/position-sets/${setId}/export`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.details || errorData.error || 'Failed to export position set');
      }
      
      // Get filename from Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition');
      const filename = contentDisposition 
        ? contentDisposition.split('filename=')[1]?.replace(/"/g, '')
        : `position-set-${setId}.json`;
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      setSuccess('Position set exported successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export position set');
      console.error('Export error:', err);
    } finally {
      setOperationLoading(null);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setOperationLoading('import');
    try {
      const content = await file.text();
      const jsonData = JSON.parse(content);

      // Handle both old format and new format
      let positions;
      if (Array.isArray(jsonData)) {
        positions = jsonData;
      } else if (jsonData.positions && Array.isArray(jsonData.positions)) {
        positions = jsonData.positions;
      } else {
        throw new Error('Invalid JSON format. Expected positions array.');
      }

      const response = await fetch('/api/position-sets/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: importData.name || `imported-${Date.now()}`,
          description: importData.description || `Imported from ${file.name}`,
          positions,
          set_as_active: importData.set_as_active
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to import position set');
      }

      const result = await response.json();
      setSuccess(`Imported ${result.positions_imported} positions successfully`);
      setShowImportForm(false);
      const wasSetAsActive = importData.set_as_active;
      setImportData({ name: '', description: '', set_as_active: false });
      await fetchPositionSets();
      if (wasSetAsActive) {
        onPositionSetChanged?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import position set');
      console.error(err);
    } finally {
      setOperationLoading(null);
      // Reset file input
      event.target.value = '';
    }
  };

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  if (loading) {
    return (
      <div className="p-6 bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center justify-center py-8">
          <LoaderIcon className="w-6 h-6 text-blue-600 mr-2" />
          <span className="text-gray-600">Loading position sets...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Position Set Manager</h2>
          <p className="text-sm text-gray-600 mt-1">
            Manage different portfolio datasets - import, export, and switch between position sets
          </p>
        </div>
        <button
          onClick={() => setShowImportForm(!showImportForm)}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
        >
          <PlusIcon className="w-4 h-4 mr-2" />
          Import New Set
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md flex items-start">
          <AlertIcon className="w-5 h-5 text-red-500 mt-0.5 mr-3 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-red-800 text-sm">{error}</p>
            <button
              onClick={clearMessages}
              className="text-red-600 text-sm underline mt-1 hover:text-red-800"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-md flex items-start">
          <CheckIcon className="w-5 h-5 text-green-500 mt-0.5 mr-3 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-green-800 text-sm">{success}</p>
            <button
              onClick={clearMessages}
              className="text-green-600 text-sm underline mt-1 hover:text-green-800"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Import Form */}
      {showImportForm && (
        <div className="p-6 bg-gray-50 border border-gray-200 rounded-lg">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Import Position Set</h3>
          <div className="space-y-4">
            <div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Set Name *
                </label>
                <input
                  type="text"
                  value={importData.name}
                  onChange={(e) => setImportData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., My Portfolio 2025"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <input
                type="text"
                value={importData.description}
                onChange={(e) => setImportData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Optional description"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center">
              <input
                type="checkbox"
                id="set-as-active"
                checked={importData.set_as_active}
                onChange={(e) => setImportData(prev => ({ ...prev, set_as_active: e.target.checked }))}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="set-as-active" className="ml-2 text-sm text-gray-900">
                Set as active position set after import
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                JSON File *
              </label>
              <input
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                disabled={operationLoading === 'import'}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Upload a JSON file with the same structure as data/positions.json
              </p>
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowImportForm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
          {operationLoading === 'import' && (
            <div className="mt-4 flex items-center text-sm text-blue-600">
              <LoaderIcon className="w-4 h-4 mr-2" />
              Importing position set...
            </div>
          )}
        </div>
      )}

      {/* Position Sets List */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Position Sets</h3>
          <p className="text-sm text-gray-600 mt-1">
            {positionSets.length} position set{positionSets.length !== 1 ? 's' : ''} available
          </p>
        </div>
        
        <div className="divide-y divide-gray-200">
          {positionSets.map((set) => (
            <div key={set.id} className="px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center">
                    <h4 className="text-sm font-medium text-gray-900 truncate">
                      {set.display_name}
                    </h4>
                    {set.is_active && (
                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                        <CheckIcon className="w-3 h-3 mr-1" />
                        Active
                      </span>
                    )}
                    {set.info_type === 'warning' && (
                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                        <AlertIcon className="w-3 h-3 mr-1" />
                        Demo Data
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    ID: {set.name} • Created: {new Date(set.created_at).toLocaleDateString()}
                  </p>
                  {set.description && (
                    <p className="text-xs text-gray-600 mt-1">{set.description}</p>
                  )}
                </div>
                
                <div className="flex items-center space-x-2 ml-4">
                  {!set.is_active && (
                    <button
                      onClick={() => handleActivateSet(set.id)}
                      disabled={operationLoading === `activate-${set.id}`}
                      className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-colors disabled:opacity-50"
                      title="Activate this position set"
                    >
                      {operationLoading === `activate-${set.id}` ? (
                        <LoaderIcon className="w-3 h-3 mr-1" />
                      ) : (
                        <PlayIcon className="w-3 h-3 mr-1" />
                      )}
                      Activate
                    </button>
                  )}
                  
                  <button
                    onClick={() => handleExportSet(set.id)}
                    disabled={operationLoading === `export-${set.id}`}
                    className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors disabled:opacity-50"
                    title="Export to JSON file"
                  >
                    {operationLoading === `export-${set.id}` ? (
                      <LoaderIcon className="w-3 h-3 mr-1" />
                    ) : (
                      <DownloadIcon className="w-3 h-3 mr-1" />
                    )}
                    Export
                  </button>
                  
                  <button
                    onClick={() => handleDeleteSet(set.id, set.display_name)}
                    disabled={operationLoading === `delete-${set.id}`}
                    className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100 transition-colors disabled:opacity-50"
                    title="Delete this position set"
                  >
                    {operationLoading === `delete-${set.id}` ? (
                      <LoaderIcon className="w-3 h-3 mr-1" />
                    ) : (
                      <TrashIcon className="w-3 h-3 mr-1" />
                    )}
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {positionSets.length === 0 && (
          <div className="px-6 py-8 text-center">
            <SettingsIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-sm font-medium text-gray-900 mb-2">No Position Sets</h3>
            <p className="text-sm text-gray-600">
              Import a JSON file to create your first position set.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PositionSetManager;
