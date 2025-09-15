import { NextRequest, NextResponse } from 'next/server';
import { CloudflareAPI } from '@/lib/cloudflare';

// GET - Get categorized rules for a specific domain
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ zoneId: string }> }
) {
  const { zoneId } = await params;

  try {
    const apiToken = request.headers.get('x-api-token');
    if (!apiToken) {
      return NextResponse.json({
        success: false,
        error: 'API token is required'
      }, { status: 401 });
    }
    const cloudflareAPI = new CloudflareAPI(apiToken);

    // Get categorized rules
    const { templateRules, customRules } = await cloudflareAPI.getCategorizedZoneRules(zoneId);

    // Format for frontend
    const formattedTemplateRules = templateRules.map(rule => ({
      friendlyId: rule.friendlyId,
      originalName: rule.originalName,
      version: rule.version,
      expression: rule.expression,
      action: rule.action,
      enabled: rule.enabled ?? true,
      cloudflareRuleId: rule.id
    }));

    const formattedCustomRules = customRules.map(rule => ({
      cloudflareRuleId: rule.id,
      description: rule.description || 'Regla sin nombre',
      expression: rule.expression,
      action: rule.action,
      enabled: rule.enabled ?? true
    }));

    return NextResponse.json({
      success: true,
      data: {
        templateRules: formattedTemplateRules,
        customRules: formattedCustomRules
      }
    });

  } catch (error) {
    console.error(`[API] Error getting domain rules for zone ${zoneId}:`, error);

    // Check if it's a 403 permission error
    if (error instanceof Error && error.message.includes('403')) {
      return NextResponse.json({
        success: false,
        error: 'Insufficient permissions to access security rules. Please ensure your API token has "Zone:Zone Settings:Read" and "Zone:Zone:Read" permissions, or contact your Cloudflare administrator.',
        errorType: 'INSUFFICIENT_PERMISSIONS'
      }, { status: 403 });
    }

    // Check for JSON parsing errors
    if (error instanceof SyntaxError && error.message.includes('JSON')) {
      console.error(`[API] JSON parse error for zone ${zoneId}:`, error.message);
      return NextResponse.json({
        success: false,
        error: 'Error parsing response from Cloudflare API',
        errorType: 'JSON_PARSE_ERROR'
      }, { status: 500 });
    }

    return NextResponse.json({
      success: false,
      error: 'Failed to get domain rules',
      errorDetails: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}