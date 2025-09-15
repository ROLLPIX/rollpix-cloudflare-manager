import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { CloudflareAPI } from '@/lib/cloudflare';
import { ProxyToggleSchema, ApiTokenSchema, validateApiRequest, createValidationErrorResponse } from '@/lib/validation';

export async function POST(request: NextRequest) {
  try {
    const apiToken = request.headers.get('x-api-token');
    
    try {
      validateApiRequest(ApiTokenSchema, apiToken);
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid API token format' },
        { status: 401 }
      );
    }

    const body = await request.json();
    let validatedData;
    try {
      validatedData = validateApiRequest(ProxyToggleSchema, body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(createValidationErrorResponse(error), { status: 400 });
      }
      return NextResponse.json({ error: 'Invalid request data' }, { status: 400 });
    }

    const { zoneId, recordId, proxied } = validatedData;

    const cloudflare = new CloudflareAPI(apiToken!);
    const updatedRecord = await cloudflare.toggleProxy(zoneId, recordId, proxied);

    return NextResponse.json(updatedRecord);
  } catch (error) {
    console.error('Error al cambiar el proxy:', error);
    return NextResponse.json(
      { error: 'No se pudo cambiar el estado del proxy' },
      { status: 500 }
    );
  }
}
