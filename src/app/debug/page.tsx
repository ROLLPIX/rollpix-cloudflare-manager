'use client';

import { useState } from 'react';

interface CacheDebugInfo {
  success: boolean;
  debug?: {
    cwd: string;
    cacheDir: string;
    exists: boolean;
    permissions?: string;
    files?: Array<{
      name: string;
      size: number;
      permissions: string;
      modified: string;
      templatesCount?: number;
      lastUpdated?: string;
    }>;
  };
  error?: string;
}

export default function DebugPage() {
  const [debugInfo, setDebugInfo] = useState<CacheDebugInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [debugKey, setDebugKey] = useState('rollpix_debug_2025');

  const fetchDebugInfo = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/debug/cache?debug_key=${debugKey}`);
      const data = await response.json();
      setDebugInfo(data);
    } catch (error) {
      setDebugInfo({
        success: false,
        error: String(error)
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white">
          Cache Debug Information
        </h1>

        <div className="mb-6 flex gap-4">
          <input
            type="text"
            value={debugKey}
            onChange={(e) => setDebugKey(e.target.value)}
            placeholder="Debug key"
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
          <button
            onClick={fetchDebugInfo}
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Loading...' : 'Fetch Debug Info'}
          </button>
        </div>

        {debugInfo && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            {debugInfo.success ? (
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">
                    Environment
                  </h2>
                  <div className="bg-gray-100 dark:bg-gray-700 rounded p-4 font-mono text-sm">
                    <div className="mb-2">
                      <span className="text-gray-600 dark:text-gray-400">CWD:</span>{' '}
                      <span className="text-gray-900 dark:text-white">{debugInfo.debug?.cwd}</span>
                    </div>
                    <div className="mb-2">
                      <span className="text-gray-600 dark:text-gray-400">Cache Dir:</span>{' '}
                      <span className="text-gray-900 dark:text-white">{debugInfo.debug?.cacheDir}</span>
                    </div>
                    <div className="mb-2">
                      <span className="text-gray-600 dark:text-gray-400">Exists:</span>{' '}
                      <span className={debugInfo.debug?.exists ? 'text-green-600' : 'text-red-600'}>
                        {debugInfo.debug?.exists ? 'YES' : 'NO'}
                      </span>
                    </div>
                    {debugInfo.debug?.permissions && (
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">Permissions:</span>{' '}
                        <span className="text-gray-900 dark:text-white">{debugInfo.debug.permissions}</span>
                      </div>
                    )}
                  </div>
                </div>

                {debugInfo.debug?.files && debugInfo.debug.files.length > 0 && (
                  <div>
                    <h2 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">
                      Cache Files ({debugInfo.debug.files.length})
                    </h2>
                    <div className="space-y-2">
                      {debugInfo.debug.files.map((file, index) => (
                        <div
                          key={index}
                          className="bg-gray-100 dark:bg-gray-700 rounded p-4"
                        >
                          <div className="font-mono text-sm">
                            <div className="font-semibold text-gray-900 dark:text-white mb-2">
                              {file.name}
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-gray-600 dark:text-gray-400">
                              <div>Size: {(file.size / 1024).toFixed(2)} KB</div>
                              <div>Permissions: {file.permissions}</div>
                              <div className="col-span-2">
                                Modified: {new Date(file.modified).toLocaleString()}
                              </div>
                              {file.templatesCount !== undefined && (
                                <div className="col-span-2 text-blue-600 dark:text-blue-400 font-semibold">
                                  Templates: {file.templatesCount}
                                </div>
                              )}
                              {file.lastUpdated && (
                                <div className="col-span-2 text-gray-500 dark:text-gray-500">
                                  Last Updated: {new Date(file.lastUpdated).toLocaleString()}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {debugInfo.debug?.files && debugInfo.debug.files.length === 0 && (
                  <div className="text-yellow-600 dark:text-yellow-400 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded">
                    Cache directory exists but is empty
                  </div>
                )}
              </div>
            ) : (
              <div className="text-red-600 dark:text-red-400 p-4 bg-red-50 dark:bg-red-900/20 rounded">
                <strong>Error:</strong> {debugInfo.error}
              </div>
            )}
          </div>
        )}

        <div className="mt-8 text-sm text-gray-600 dark:text-gray-400">
          <p>This page shows cache directory information for debugging purposes.</p>
          <p className="mt-2">
            Expected cache location: <code className="bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">/app/cache</code>
          </p>
        </div>
      </div>
    </div>
  );
}
