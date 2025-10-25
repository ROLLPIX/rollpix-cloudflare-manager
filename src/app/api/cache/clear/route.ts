import { NextResponse } from 'next/server';
import { PersistentStorage } from '@/lib/persistentStorage';

/**
 * Clear all cache files
 * Use this when changing API tokens to ensure no stale data from previous account
 */
export async function POST() {
  try {
    console.log('[Clear Cache API] Clearing all cache files...');

    await PersistentStorage.clearAll();

    return NextResponse.json({
      success: true,
      message: 'All cache files cleared successfully'
    });
  } catch (error) {
    console.error('[Clear Cache API] Error clearing cache:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to clear cache files'
    }, { status: 500 });
  }
}
