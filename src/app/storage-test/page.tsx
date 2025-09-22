'use client';

import { useState, useEffect } from 'react';

export default function StorageTest() {
  const [storageInfo, setStorageInfo] = useState<any>(null);
  const [testResults, setTestResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [clientData, setClientData] = useState<any>(null);

  // Test client-side localStorage directly
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Test writing to localStorage
      const testData = {
        timestamp: new Date().toISOString(),
        test: true,
        clientSide: true
      };

      try {
        localStorage.setItem('rollpix_cache_test-client.json', JSON.stringify({
          data: testData,
          timestamp: Date.now(),
          expiry: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
        }));

        // Read it back
        const stored = localStorage.getItem('rollpix_cache_test-client.json');
        if (stored) {
          const parsed = JSON.parse(stored);
          setClientData(parsed.data);
        }
      } catch (error) {
        console.error('Client storage test failed:', error);
      }
    }
  }, []);

  const fetchStorageInfo = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/storage-info');
      const data = await response.json();
      setStorageInfo(data);
    } catch (error) {
      console.error('Failed to fetch storage info:', error);
    } finally {
      setLoading(false);
    }
  };

  const testServerStorage = async () => {
    setLoading(true);
    try {
      const testData = {
        serverTest: true,
        timestamp: new Date().toISOString(),
        randomValue: Math.random()
      };

      // Test write
      const writeResponse = await fetch('/api/storage-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test-write',
          fileName: 'user-preferences.json',
          data: testData
        })
      });

      const writeResult = await writeResponse.json();
      console.log('Write result:', writeResult);

      // Test read
      const readResponse = await fetch('/api/storage-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test-read',
          fileName: 'user-preferences.json'
        })
      });

      const readResult = await readResponse.json();
      console.log('Read result:', readResult);

      setTestResults({
        write: writeResult,
        read: readResult,
        matches: JSON.stringify(testData) === JSON.stringify(readResult.data)
      });

    } catch (error) {
      console.error('Server storage test failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const getLocalStorageStats = () => {
    if (typeof window === 'undefined') return null;

    const keys = Object.keys(localStorage);
    const rollpixKeys = keys.filter(key => key.startsWith('rollpix_cache_'));

    return {
      totalKeys: keys.length,
      rollpixKeys: rollpixKeys.length,
      rollpixKeysList: rollpixKeys,
      estimatedSize: rollpixKeys.reduce((size, key) => {
        const value = localStorage.getItem(key) || '';
        return size + key.length + value.length;
      }, 0)
    };
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Storage Test - Vercel Compatibility</h1>

      <div className="grid gap-6">
        {/* Storage Info */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Storage Information</h2>
          <button
            onClick={fetchStorageInfo}
            disabled={loading}
            className="bg-blue-500 text-white px-4 py-2 rounded disabled:opacity-50 mb-4"
          >
            {loading ? 'Loading...' : 'Fetch Storage Info'}
          </button>

          {storageInfo && (
            <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
              {JSON.stringify(storageInfo, null, 2)}
            </pre>
          )}
        </div>

        {/* Server Storage Test */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Server Storage Test</h2>
          <button
            onClick={testServerStorage}
            disabled={loading}
            className="bg-green-500 text-white px-4 py-2 rounded disabled:opacity-50 mb-4"
          >
            {loading ? 'Testing...' : 'Test Server Storage'}
          </button>

          {testResults && (
            <div>
              <h3 className="font-semibold mb-2">Test Results:</h3>
              <div className={`p-3 rounded ${testResults.matches ? 'bg-green-100' : 'bg-red-100'}`}>
                <p><strong>Data Persistence:</strong> {testResults.matches ? '✅ Success' : '❌ Failed'}</p>
              </div>
              <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto mt-2">
                {JSON.stringify(testResults, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Client Storage Test */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Client Storage Test</h2>

          {clientData ? (
            <div>
              <div className="p-3 bg-green-100 rounded mb-4">
                <p><strong>Client localStorage:</strong> ✅ Working</p>
              </div>
              <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
                {JSON.stringify(clientData, null, 2)}
              </pre>
            </div>
          ) : (
            <div className="p-3 bg-yellow-100 rounded">
              <p><strong>Client localStorage:</strong> ⚠️ Not available or failed</p>
            </div>
          )}

          <div className="mt-4">
            <h3 className="font-semibold mb-2">localStorage Stats:</h3>
            <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
              {JSON.stringify(getLocalStorageStats(), null, 2)}
            </pre>
          </div>
        </div>

        {/* Environment Info */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Environment</h2>
          <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
            {JSON.stringify({
              isClient: typeof window !== 'undefined',
              hasLocalStorage: typeof localStorage !== 'undefined',
              userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A'
            }, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}