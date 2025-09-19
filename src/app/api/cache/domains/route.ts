import { NextRequest, NextResponse } from 'next/server';
import { safeReadJsonFile } from '@/lib/fileSystem';

/**
 * GET /api/cache/domains
 * Returns the domains cache data for client-side access
 */
export async function GET(request: NextRequest) {
  try {
    const domainsCache = await safeReadJsonFile('domains-cache.json');

    return NextResponse.json(domainsCache);
  } catch (error) {
    console.error('Error reading domains cache:', error);

    // Return empty cache structure if file doesn't exist
    return NextResponse.json({
      domains: [],
      lastUpdated: new Date().toISOString()
    });
  }
}