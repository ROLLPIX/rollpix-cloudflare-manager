import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { join } from 'path';
import { DomainStatus } from '@/types/cloudflare';

const CACHE_FILE_PATH = join(process.cwd(), 'domains-cache.json');

interface CacheData {
  domains: DomainStatus[];
  lastUpdate: string;
  totalCount: number;
}

export async function GET() {
  try {
    const cacheContent = await fs.readFile(CACHE_FILE_PATH, 'utf-8');
    const cacheData: CacheData = JSON.parse(cacheContent);
    
    return NextResponse.json(cacheData);
  } catch (error) {
    // File doesn't exist or can't be read
    return NextResponse.json({ 
      domains: [], 
      lastUpdate: null, 
      totalCount: 0 
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { domains }: { domains: DomainStatus[] } = await request.json();
    
    if (!Array.isArray(domains)) {
      return NextResponse.json(
        { error: 'Domains must be an array' },
        { status: 400 }
      );
    }

    const cacheData: CacheData = {
      domains,
      lastUpdate: new Date().toISOString(),
      totalCount: domains.length
    };

    await fs.writeFile(CACHE_FILE_PATH, JSON.stringify(cacheData, null, 2));

    return NextResponse.json({ success: true, ...cacheData });
  } catch (error) {
    console.error('Error saving cache:', error);
    return NextResponse.json(
      { error: 'Failed to save cache' },
      { status: 500 }
    );
  }
}