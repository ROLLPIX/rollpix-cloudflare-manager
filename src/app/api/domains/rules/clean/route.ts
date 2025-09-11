import { NextRequest, NextResponse } from 'next/server';
import { CloudflareAPI } from '@/lib/cloudflare';

// POST - Clean rules from a domain
export async function POST(request: NextRequest) {
  try {
    const apiToken = request.headers.get('x-api-token');
    if (!apiToken) {
      return NextResponse.json({
        success: false,
        error: 'API token is required'
      }, { status: 401 });
    }

    const body = await request.json();
    const { zoneId, cleanType } = body;

    if (!zoneId || !cleanType) {
      return NextResponse.json({
        success: false,
        error: 'Zone ID and clean type are required'
      }, { status: 400 });
    }

    if (!['template', 'all'].includes(cleanType)) {
      return NextResponse.json({
        success: false,
        error: 'Clean type must be "template" or "all"'
      }, { status: 400 });
    }

    const cloudflareAPI = new CloudflareAPI(apiToken);

    let result;
    if (cleanType === 'template') {
      result = await cloudflareAPI.removeAllTemplateRules(zoneId);
    } else {
      result = await cloudflareAPI.removeAllRules(zoneId);
    }

    if (result.success) {
      return NextResponse.json({
        success: true,
        data: {
          removedCount: result.removedCount,
          message: result.message
        }
      });
    } else {
      return NextResponse.json({
        success: false,
        error: result.message
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Error cleaning rules:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to clean rules'
    }, { status: 500 });
  }
}