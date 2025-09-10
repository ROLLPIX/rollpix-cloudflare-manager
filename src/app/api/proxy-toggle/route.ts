import { NextRequest, NextResponse } from 'next/server';
import { CloudflareAPI } from '@/lib/cloudflare';

export async function POST(request: NextRequest) {
  try {
    const apiToken = request.headers.get('x-api-token');
    
    if (!apiToken) {
      return NextResponse.json(
        { error: 'API token is required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { zoneId, recordId, proxied } = body;

    if (!zoneId || !recordId || typeof proxied !== 'boolean') {
      return NextResponse.json(
        { error: 'zoneId, recordId, and proxied are required' },
        { status: 400 }
      );
    }

    const cloudflare = new CloudflareAPI(apiToken);
    const updatedRecord = await cloudflare.toggleProxy(zoneId, recordId, proxied);

    return NextResponse.json(updatedRecord);
  } catch (error) {
    console.error('Error toggling proxy:', error);
    return NextResponse.json(
      { error: 'Failed to toggle proxy' },
      { status: 500 }
    );
  }
}