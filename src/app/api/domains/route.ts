import { NextRequest, NextResponse } from 'next/server';
import { CloudflareAPI } from '@/lib/cloudflare';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const perPage = parseInt(searchParams.get('per_page') || '20');
    
    const apiToken = request.headers.get('x-api-token');
    
    if (!apiToken) {
      return NextResponse.json(
        { error: 'API token is required' },
        { status: 400 }
      );
    }

    const cloudflare = new CloudflareAPI(apiToken);
    const result = await cloudflare.getDomainStatuses(page, perPage);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching domains:', error);
    return NextResponse.json(
      { error: 'Failed to fetch domains' },
      { status: 500 }
    );
  }
}