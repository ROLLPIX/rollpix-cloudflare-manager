import { NextRequest, NextResponse } from 'next/server';
import { CloudflareAPI } from '@/lib/cloudflare';

// DELETE - Delete individual custom rule
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ ruleId: string }> }) {
  try {
    const apiToken = request.headers.get('x-api-token');
    const zoneId = request.headers.get('x-zone-id');
    const { ruleId } = await params;

    if (!apiToken) {
      return NextResponse.json({
        success: false,
        error: 'API token is required'
      }, { status: 401 });
    }

    if (!zoneId) {
      return NextResponse.json({
        success: false,
        error: 'Zone ID is required'
      }, { status: 400 });
    }

    const cloudflareAPI = new CloudflareAPI(apiToken);

    // Get all rulesets and filter for custom firewall rulesets to find which one contains this rule
    const allRulesets = await cloudflareAPI.getZoneRulesets(zoneId);
    const rulesets = allRulesets.filter(ruleset => ruleset.phase === 'http_request_firewall_custom');
    
    let rulesetId = null;
    let rulesetToUpdate = null;

    // Find the ruleset that contains this rule
    for (const ruleset of rulesets) {
      if (ruleset.phase === 'http_request_firewall_custom') {
        const detailedRuleset = await cloudflareAPI.getZoneRuleset(zoneId, ruleset.id);
        const ruleExists = detailedRuleset.rules?.find(rule => rule.id === ruleId);
        
        if (ruleExists) {
          rulesetId = ruleset.id;
          rulesetToUpdate = detailedRuleset;
          break;
        }
      }
    }

    if (!rulesetId || !rulesetToUpdate) {
      return NextResponse.json({
        success: false,
        error: 'Rule not found'
      }, { status: 404 });
    }

    // Remove the rule from the ruleset
    const updatedRules = rulesetToUpdate.rules?.filter(rule => rule.id !== ruleId) || [];

    // Update the ruleset
    const updatedRuleset = await cloudflareAPI.updateZoneRuleset(zoneId, rulesetId, {
      rules: updatedRules
    });

    return NextResponse.json({
      success: true,
      message: 'Custom rule deleted successfully',
      data: {
        rulesetId,
        remainingRules: updatedRules.length
      }
    });

  } catch (error) {
    console.error('Error deleting custom rule:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to delete custom rule'
    }, { status: 500 });
  }
}