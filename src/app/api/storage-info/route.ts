/**
 * Storage information endpoint
 * Shows how persistent storage is working in different environments
 */
import { NextRequest, NextResponse } from 'next/server';
import { PersistentStorage } from '@/lib/persistentStorage';
import { safeReadJsonFile, safeWriteJsonFile } from '@/lib/fileSystem';

export async function GET(request: NextRequest) {
  try {
    console.log('[StorageInfo] Getting storage information...');

    // Get storage info
    const storageInfo = PersistentStorage.getInfo();

    // Test basic operations
    const testData = {
      test: true,
      timestamp: new Date().toISOString(),
      randomValue: Math.random()
    };

    // Test each file type
    const testResults: Record<string, any> = {};

    const filesToTest = [
      'user-preferences.json',
      'security-rules-templates.json',
      'domains-cache.json'
    ];

    for (const fileName of filesToTest) {
      console.log(`[StorageInfo] Testing ${fileName}...`);

      try {
        // Write test data
        await safeWriteJsonFile(fileName, { ...testData, fileName });

        // Read it back
        const readData = await safeReadJsonFile(fileName);

        testResults[fileName] = {
          success: true,
          wrote: testData,
          read: readData,
          matches: JSON.stringify(testData.timestamp) === JSON.stringify(readData.timestamp)
        };

      } catch (error) {
        testResults[fileName] = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }

    const result = {
      success: true,
      storageInfo,
      testResults,
      environment: {
        isServerless: !!process.env.LAMBDA_TASK_ROOT,
        nodeEnv: process.env.NODE_ENV,
        hasLocalStorage: typeof window !== 'undefined' && typeof localStorage !== 'undefined'
      },
      timestamp: new Date().toISOString()
    };

    return NextResponse.json(result);

  } catch (error) {
    console.error('[StorageInfo] Error:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, fileName, data } = body;

    switch (action) {
      case 'test-write':
        if (!fileName || !data) {
          return NextResponse.json({
            success: false,
            error: 'fileName and data are required'
          }, { status: 400 });
        }

        await safeWriteJsonFile(fileName, data);

        return NextResponse.json({
          success: true,
          message: `Successfully wrote ${fileName}`,
          data
        });

      case 'test-read':
        if (!fileName) {
          return NextResponse.json({
            success: false,
            error: 'fileName is required'
          }, { status: 400 });
        }

        const readData = await safeReadJsonFile(fileName);

        return NextResponse.json({
          success: true,
          message: `Successfully read ${fileName}`,
          data: readData
        });

      case 'maintenance':
        await PersistentStorage.maintenance();

        return NextResponse.json({
          success: true,
          message: 'Maintenance completed'
        });

      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action. Use: test-write, test-read, or maintenance'
        }, { status: 400 });
    }

  } catch (error) {
    console.error('[StorageInfo] POST Error:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}