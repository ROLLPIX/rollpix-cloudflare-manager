import { NextResponse } from 'next/server';
import { PersistentStorage } from '@/lib/persistentStorage';
import { rm } from 'fs/promises';
import path from 'path';

/**
 * Clear all cache files including Next.js build cache
 * Use this when changing API tokens to ensure no stale data from previous account
 */
export async function POST() {
  try {
    console.log('[Clear Cache API] Clearing all cache files...');

    // Clear application cache files (cache/ directory)
    await PersistentStorage.clearAll();

    // Clear Next.js build cache (.next/cache/)
    try {
      const nextCachePath = path.join(process.cwd(), '.next', 'cache');
      console.log('[Clear Cache API] Clearing Next.js build cache:', nextCachePath);
      await rm(nextCachePath, { recursive: true, force: true });
      console.log('[Clear Cache API] Next.js build cache cleared successfully');
    } catch (nextCacheError) {
      console.warn('[Clear Cache API] Failed to clear Next.js cache (may not exist):', nextCacheError);
      // Don't fail the entire operation if .next/cache doesn't exist or can't be deleted
    }

    return NextResponse.json({
      success: true,
      message: 'All cache files cleared successfully (including build cache)'
    });
  } catch (error) {
    console.error('[Clear Cache API] Error clearing cache:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to clear cache files'
    }, { status: 500 });
  }
}
