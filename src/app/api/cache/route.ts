import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { DomainStatus } from '@/types/cloudflare';
import { safeReadJsonFile, safeWriteJsonFile } from '@/lib/fileSystem';
import { DomainCacheSchema, validateApiRequest, createValidationErrorResponse } from '@/lib/validation';

const CACHE_FILE_NAME = 'domains-cache.json';

interface CacheData {
  domains: DomainStatus[];
  lastUpdate: string;
  totalCount: number;
}

export async function GET() {
  const startTime = Date.now();
  console.log('[Cache API] Starting cache read...');

  try {
    const cacheData = await safeReadJsonFile<CacheData>(CACHE_FILE_NAME);
    const readTime = Date.now() - startTime;
    console.log(`[Cache API] Cache read completed in ${readTime}ms with ${cacheData.domains?.length || 0} domains`);
    return NextResponse.json(cacheData);
  } catch (error) {
    const readTime = Date.now() - startTime;
    console.log(`[Cache API] Cache read failed after ${readTime}ms:`, error);
    // File doesn't exist or is invalid
    return NextResponse.json({
      domains: [],
      lastUpdate: null,
      totalCount: 0
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    let validatedData;
    try {
      validatedData = validateApiRequest(DomainCacheSchema, body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(createValidationErrorResponse(error), { status: 400 });
      }
      return NextResponse.json({ error: 'Invalid request data' }, { status: 400 });
    }

    const { domains } = validatedData;

    const cacheData: CacheData = {
      domains,
      lastUpdate: new Date().toISOString(),
      totalCount: domains.length
    };

    await safeWriteJsonFile(CACHE_FILE_NAME, cacheData);

    return NextResponse.json({ success: true, ...cacheData });
  } catch (error) {
    console.error('Error al guardar en caché:', error);
    return NextResponse.json(
      { error: 'No se pudo guardar en caché' },
      { status: 500 }
    );
  }
}
