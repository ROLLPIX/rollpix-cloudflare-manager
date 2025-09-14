import { NextRequest, NextResponse } from 'next/server';
import { CloudflareAPI } from '@/lib/cloudflare';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const apiToken = request.headers.get('x-api-token');
    
    if (!apiToken) {
      return NextResponse.json({ error: 'API token is required' }, { status: 401 });
    }

    const cloudflare = new CloudflareAPI(apiToken);
    const zoneId = searchParams.get('zoneId');

    if (zoneId) {
      // Fetch a single domain
      const zone = await cloudflare.getZone(zoneId);
      const result = await cloudflare.getDomainStatuses(1, 1, [zone]);
      return NextResponse.json(result);
    } else {
      // Fetch a paginated list of domains
      const page = parseInt(searchParams.get('page') || '1');
      const perPage = parseInt(searchParams.get('per_page') || '20');
      const zonesResponse = await cloudflare.getZones(page, perPage);
      const result = await cloudflare.getDomainStatuses(page, perPage, zonesResponse.zones);
      result.totalCount = zonesResponse.totalCount;
      result.totalPages = zonesResponse.totalPages;
      return NextResponse.json(result);
    }
  } catch (error) {
    console.error('Error fetching domains:', error);
    return NextResponse.json({ error: 'Failed to fetch domains' }, { status: 500 });
  }
}
