import { NextRequest } from 'next/server';
import { CloudflareAPI } from '@/lib/cloudflare';
import { RuleTemplate } from '@/types/cloudflare';
import { safeReadJsonFile } from '@/lib/fileSystem';

const RULES_TEMPLATES_FILE = 'security-rules-templates.json';

interface RulesTemplatesCache {
  templates: RuleTemplate[];
  lastUpdated: string;
}

interface BulkActionProgress {
  type: 'progress' | 'domain_complete' | 'complete' | 'error';
  progress: number;
  currentDomain?: string;
  completedDomains?: number;
  totalDomains?: number;
  domain?: {
    zoneId: string;
    domainName: string;
    success: boolean;
    message: string;
    error?: string;
  };
  summary?: {
    total: number;
    successful: number;
    failed: number;
  };
  error?: string;
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

// POST - Bulk action on domain rules with streaming progress
export async function POST(request: NextRequest) {
  const apiToken = request.headers.get('x-api-token');
  if (!apiToken) {
    return new Response(
      JSON.stringify({ success: false, error: 'API token is required' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const body = await request.json();
  const { action, selectedRules, targetZoneIds, signal: clientSignal } = body;

  if (!action || !targetZoneIds || targetZoneIds.length === 0) {
    return new Response(
      JSON.stringify({ success: false, error: 'Action and target zones are required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Create a streaming response
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Helper function to send progress updates
      const sendProgress = (data: BulkActionProgress) => {
        const chunk = encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
        controller.enqueue(chunk);
      };

      try {
        const cloudflareAPI = new CloudflareAPI(apiToken);
        const templatesCache = await loadRulesTemplates();

        // Get zone information for domain names
        const zonesResponse = await cloudflareAPI.getZones(1, 200);
        const zoneMap = new Map(zonesResponse.zones.map(zone => [zone.id, zone.name]));
        const reverseZoneMap = new Map(zonesResponse.zones.map(zone => [zone.name, zone.id]));

        // Validate and convert targetZoneIds
        const validatedZoneIds = targetZoneIds.map((zoneId: string) => {
          if (zoneId.includes('.') && !zoneId.match(/^[a-f0-9]{32}$/)) {
            const actualZoneId = reverseZoneMap.get(zoneId);
            if (actualZoneId) {
              return actualZoneId;
            }
          }
          return zoneId;
        });

        sendProgress({
          type: 'progress',
          progress: 0,
          totalDomains: validatedZoneIds.length,
          completedDomains: 0
        });

        const results: Array<{
          zoneId: string;
          domainName: string;
          success: boolean;
          message: string;
          error?: string;
        }> = [];

        // Process domains in parallel batches with progress updates
        const BATCH_SIZE = 5;
        let completedCount = 0;

        for (let i = 0; i < validatedZoneIds.length; i += BATCH_SIZE) {
          // Check for cancellation (simplified - in a real implementation you'd use AbortController)
          if (clientSignal && clientSignal.aborted) {
            sendProgress({
              type: 'error',
              progress: (completedCount / validatedZoneIds.length) * 100,
              error: 'Operation cancelled by user'
            });
            controller.close();
            return;
          }

          const batchZoneIds = validatedZoneIds.slice(i, i + BATCH_SIZE);

          const batchPromises = batchZoneIds.map(async (zoneId: string) => {
            const domainName = zoneMap.get(zoneId) || zoneId;

            try {
              let result = {
                zoneId,
                domainName,
                success: false,
                message: '',
                error: undefined as string | undefined
              };

              if (action === 'clean') {
                const cleanResult = await cloudflareAPI.removeAllRules(zoneId);
                result.success = cleanResult.success;
                result.message = cleanResult.message;
              } else if (action === 'add') {
                let addedCount = 0;
                let skippedCount = 0;

                for (const friendlyId of selectedRules) {
                  const template = templatesCache.templates.find(t => t.friendlyId === friendlyId);
                  if (!template) continue;

                  const applyResult = await cloudflareAPI.applyTemplateRule(zoneId, template);
                  if (applyResult.success) {
                    if (applyResult.action === 'added' || applyResult.action === 'updated') {
                      addedCount++;
                    } else {
                      skippedCount++;
                    }
                  }
                }

                result.success = true;
                result.message = `Added: ${addedCount}, Skipped: ${skippedCount}`;
              } else if (action === 'remove') {
                let removedCount = 0;

                for (const friendlyId of selectedRules) {
                  const removeResult = await cloudflareAPI.removeTemplateRule(zoneId, friendlyId);
                  if (removeResult.success && removeResult.removedRuleId) {
                    removedCount++;
                  }
                }

                result.success = true;
                result.message = `Removed: ${removedCount}`;
              }

              return result;

            } catch (error) {
              return {
                zoneId,
                domainName,
                success: false,
                message: `Failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                error: error instanceof Error ? error.message : 'Unknown error'
              };
            }
          });

          // Wait for current batch to complete
          const batchResults = await Promise.all(batchPromises);

          // Add results and send progress updates for each completed domain
          for (const result of batchResults) {
            results.push(result);
            completedCount++;

            // Send individual domain completion
            sendProgress({
              type: 'domain_complete',
              progress: (completedCount / validatedZoneIds.length) * 100,
              currentDomain: result.domainName,
              completedDomains: completedCount,
              totalDomains: validatedZoneIds.length,
              domain: result
            });
          }

          // Add delay between batches for rate limiting
          if (i + BATCH_SIZE < validatedZoneIds.length) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }

        // Send final completion
        const summary = {
          total: results.length,
          successful: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length
        };

        sendProgress({
          type: 'complete',
          progress: 100,
          completedDomains: completedCount,
          totalDomains: validatedZoneIds.length,
          summary
        });

      } catch (error) {
        sendProgress({
          type: 'error',
          progress: 0,
          error: error instanceof Error ? error.message : 'Unknown error occurred'
        });
      }

      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Content-Type, x-api-token'
    }
  });
}