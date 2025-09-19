import { NextRequest, NextResponse } from 'next/server';
import { CloudflareAPI } from '@/lib/cloudflare';
import { RuleTemplate } from '@/types/cloudflare';
import { safeReadJsonFile } from '@/lib/fileSystem';

const RULES_TEMPLATES_FILE = 'security-rules-templates.json';

interface RulesTemplatesCache {
  templates: RuleTemplate[];
  lastUpdated: string;
}

async function loadRulesTemplates(): Promise<RulesTemplatesCache> {
  try {
    return await safeReadJsonFile<RulesTemplatesCache>(RULES_TEMPLATES_FILE);
  } catch {
    return {
      templates: [],
      lastUpdated: new Date().toISOString()
    };
  }
}

// POST - Bulk action on domain rules
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
    const { action, selectedRules, targetZoneIds, preview = false } = body;

    if (!action || !targetZoneIds || targetZoneIds.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Action and target zones are required'
      }, { status: 400 });
    }

    if (!['add', 'remove', 'clean', 'clean-custom'].includes(action)) {
      return NextResponse.json({
        success: false,
        error: 'Action must be add, remove, clean, or clean-custom'
      }, { status: 400 });
    }

    if (action !== 'clean' && action !== 'clean-custom' && (!selectedRules || selectedRules.length === 0)) {
      return NextResponse.json({
        success: false,
        error: 'Selected rules are required for add/remove actions'
      }, { status: 400 });
    }

    const cloudflareAPI = new CloudflareAPI(apiToken);
    const templatesCache = await loadRulesTemplates();

    // Get zone information for domain names
    const zonesResponse = await cloudflareAPI.getZones(1, 200);
    const zoneMap = new Map(zonesResponse.zones.map(zone => [zone.id, zone.name]));
    const reverseZoneMap = new Map(zonesResponse.zones.map(zone => [zone.name, zone.id]));

    // Validate and convert targetZoneIds to ensure they are actual zone IDs, not domain names
    const validatedZoneIds = targetZoneIds.map((zoneId: string) => {
      // Check if zoneId looks like a domain name instead of a zone ID
      if (zoneId.includes('.') && !zoneId.match(/^[a-f0-9]{32}$/)) {
        // This looks like a domain name, try to get the correct zone ID
        const actualZoneId = reverseZoneMap.get(zoneId);
        if (actualZoneId) {
          console.log(`[BulkAction] Converting domain name "${zoneId}" to zone ID "${actualZoneId}"`);
          return actualZoneId;
        } else {
          console.warn(`[BulkAction] Domain name "${zoneId}" not found in available zones`);
          return zoneId; // Return as-is and let it fail later
        }
      }
      return zoneId; // Already a valid zone ID
    });

    const results: Array<{
      zoneId: string;
      domainName: string;
      success: boolean;
      error?: string;
      message: string;
      conflicts?: any[];
    }> = [];

    // Process each target zone (now using validated zone IDs)
    for (const zoneId of validatedZoneIds) {
      const domainName = zoneMap.get(zoneId) || zoneId;
      const result = {
        zoneId,
        domainName,
        success: false,
        error: undefined as string | undefined,
        message: '',
        conflicts: [] as any[]
      };

      try {
        if (action === 'clean') {
          // Clean all rules
          if (!preview) {
            const cleanResult = await cloudflareAPI.removeAllRules(zoneId);
            result.success = cleanResult.success;
            result.message = cleanResult.message;
          } else {
            // Preview: just get current rules count
            const existingRules = await cloudflareAPI.getZoneSecurityRules(zoneId);
            result.success = true;
            result.message = `Will remove ${existingRules.length} rules`;
          }
        } else if (action === 'add') {
          // Add selected rules
          let addedCount = 0;
          let skippedCount = 0;
          const messages: string[] = [];

          for (const friendlyId of selectedRules) {
            const template = templatesCache.templates.find(t => t.friendlyId === friendlyId);
            if (!template) {
              messages.push(`Template ${friendlyId} not found`);
              continue;
            }


            if (!preview) {
              const applyResult = await cloudflareAPI.applyTemplateRule(zoneId, template);

              if (applyResult.success) {

                if (applyResult.action === 'added' || applyResult.action === 'updated') {
                  addedCount++;
                } else {
                  skippedCount++;
                }
                messages.push(applyResult.message);
              } else {
                messages.push(`Failed to apply ${friendlyId}: ${applyResult.message}`);
              }
            } else {
              // Preview: check for conflicts
              const existingRules = await cloudflareAPI.getZoneSecurityRules(zoneId);
              const hasConflict = existingRules.some(rule => 
                rule.description?.includes(`#${friendlyId}v`)
              );
              
              if (hasConflict) {
                result.conflicts!.push({
                  friendlyId,
                  type: 'update_existing'
                });
                messages.push(`${friendlyId} will be updated (rule exists)`);
              } else {
                messages.push(`${friendlyId} will be added (new rule)`);
              }
              addedCount++;
            }
          }

          result.success = true;
          result.message = preview
            ? `Will process ${selectedRules.length} rules`
            : `Added: ${addedCount}, Skipped: ${skippedCount}`;


        } else if (action === 'remove') {
          // Remove selected rules
          let removedCount = 0;
          const messages: string[] = [];

          for (const friendlyId of selectedRules) {
            if (!preview) {
              const removeResult = await cloudflareAPI.removeTemplateRule(zoneId, friendlyId);
              if (removeResult.success && removeResult.removedRuleId) {
                removedCount++;
              }
              messages.push(removeResult.message);
            } else {
              // Preview: check if rule exists
              const existingRules = await cloudflareAPI.getZoneSecurityRules(zoneId);
              const hasRule = existingRules.some(rule => 
                rule.description?.includes(`#${friendlyId}v`)
              );
              
              if (hasRule) {
                messages.push(`${friendlyId} will be removed`);
                removedCount++;
              } else {
                messages.push(`${friendlyId} not found`);
              }
            }
          }

          result.success = true;
          result.message = preview
            ? `Will remove ${removedCount} rules`
            : `Removed: ${removedCount}`;
        } else if (action === 'clean-custom') {
          // Clean only custom rules (non-template rules)
          if (!preview) {
            const cleanResult = await cloudflareAPI.removeCustomRules(zoneId);
            result.success = cleanResult.success;
            result.message = cleanResult.message;
          } else {
            // Preview: get custom rules count
            const { customRules } = await cloudflareAPI.getCategorizedZoneRules(zoneId);
            result.success = true;
            result.message = `Will remove ${customRules.length} custom rules`;
          }
        }

      } catch (error) {
        result.success = false;
        result.error = error instanceof Error ? error.message : 'Unknown error';
        result.message = `Failed: ${result.error}`;
      }

      results.push(result);
    }

    // Calculate summary
    const summary = {
      total: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      conflicts: results.reduce((sum, r) => sum + (r.conflicts?.length || 0), 0)
    };

    // If any rules were actually removed/cleaned and it's not a preview, refresh affected domains
    if (!preview && summary.successful > 0 && (action === 'remove' || action === 'clean' || action === 'clean-custom')) {
      console.log(`[BulkAction] Refreshing affected domains after ${action} operation on ${summary.successful} domains`);

      // Refresh each affected domain individually to update cache
      const refreshPromises = validatedZoneIds.map(async (zoneId: string) => {
        try {
          const domainName = zoneMap.get(zoneId) || zoneId;
          console.log(`[BulkAction] Refreshing domain ${domainName} (${zoneId})`);

          const refreshedDomain = await cloudflareAPI.getCompleteDomainInfo(zoneId, domainName, new Map());
          console.log(`[BulkAction] Successfully refreshed ${domainName} - Rules: ${refreshedDomain.securityRules?.templateRules?.length || 0} template`);

          return { success: true, domain: domainName };
        } catch (error) {
          console.warn(`[BulkAction] Failed to refresh domain ${zoneId}:`, error);
          return { success: false, domain: zoneId, error };
        }
      });

      const refreshResults = await Promise.allSettled(refreshPromises);
      const successfulRefreshes = refreshResults.filter(r => r.status === 'fulfilled' && r.value.success).length;
      console.log(`[BulkAction] Refreshed ${successfulRefreshes}/${validatedZoneIds.length} domains successfully`);
    }

    return NextResponse.json({
      success: true,
      data: {
        results,
        summary,
        preview,
        action
      }
    });

  } catch (error) {
    console.error('Error in bulk rule action:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to execute bulk rule action'
    }, { status: 500 });
  }
}
