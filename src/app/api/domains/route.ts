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
      let zone;

      // Check if zoneId looks like a domain name instead of a zone ID
      if (zoneId.includes('.') && !zoneId.match(/^[a-f0-9]{32}$/)) {
        console.log(`[API] Received domain name "${zoneId}" instead of zone ID, searching for correct zone`);
        // Search for the zone by domain name
        const zonesResponse = await cloudflare.getZones(1, 100); // Get up to 100 zones
        zone = zonesResponse.zones.find(z => z.name === zoneId);

        if (!zone) {
          return NextResponse.json({
            error: `Zone not found for domain "${zoneId}". Available zones: ${zonesResponse.zones.map(z => z.name).join(', ')}`
          }, { status: 404 });
        }

        console.log(`[API] Found zone ID "${zone.id}" for domain "${zoneId}"`);
      } else {
        // Use as zone ID directly
        zone = await cloudflare.getZone(zoneId);
      }

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
