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
  type: 'progress' | 'domain_complete' | 'complete' | 'error' | 'phase_update';
  progress: number;
  currentDomain?: string;
  completedDomains?: number;
  totalDomains?: number;
  phase?: {
    current: 'api_calls' | 'verification' | 'cache_refresh';
    description: string;
    progress: number;
  };
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

        // 🚩 FEATURE FLAGS: Enable optimizations
        const USE_THREE_PHASE_SYSTEM = true;
        const USE_MAPPING_TABLE_REMOVAL = true; // Use direct Cloudflare ID lookup for removal

        if (USE_THREE_PHASE_SYSTEM) {
          // 🔄 THREE-PHASE SYSTEM: API Calls → Verification → Cache Refresh
          await processWithThreePhases();
        } else {
          // 📦 LEGACY SYSTEM: Single phase processing
          await processLegacyMode();
        }

        async function processWithThreePhases() {
          // PHASE 1: API CALLS (0-20%)
          sendProgress({
            type: 'phase_update',
            progress: 0,
            totalDomains: validatedZoneIds.length,
            completedDomains: 0,
            phase: {
              current: 'api_calls',
              description: 'Aplicando cambios de reglas en Cloudflare...',
              progress: 0
            }
          });

          const results: Array<{
            zoneId: string;
            domainName: string;
            success: boolean;
            message: string;
            error?: string;
            templateNames?: string[]; // Track which templates were affected
          }> = [];

          // Process domains in parallel batches with progress updates
          const BATCH_SIZE = 5;
          let completedCount = 0;

          for (let i = 0; i < validatedZoneIds.length; i += BATCH_SIZE) {
            if (clientSignal && clientSignal.aborted) {
              sendProgress({
                type: 'error',
                progress: (completedCount / validatedZoneIds.length) * 20,
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
                  error: undefined as string | undefined,
                  templateNames: [] as string[]
                };

                if (action === 'clean') {
                  const cleanResult = await cloudflareAPI.removeAllRules(zoneId);
                  result.success = cleanResult.success;
                  result.message = cleanResult.message;
                  result.templateNames = ['all_templates']; // Special marker for clean operation
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
                        // Store friendlyId for verification instead of template.name
                        result.templateNames.push(friendlyId);
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
                    const template = templatesCache.templates.find(t => t.friendlyId === friendlyId);
                    if (!template) continue;

                    // 🚀 Use optimized removal by mapping table if enabled
                    const removeResult = USE_MAPPING_TABLE_REMOVAL
                      ? await cloudflareAPI.removeTemplateRuleByMapping(zoneId, friendlyId)
                      : await cloudflareAPI.removeTemplateRule(zoneId, friendlyId);

                    if (removeResult.success && removeResult.removedRuleId) {
                      removedCount++;
                      // Store friendlyId for verification instead of template.name
                      result.templateNames.push(friendlyId);
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
                  error: error instanceof Error ? error.message : 'Unknown error',
                  templateNames: []
                };
              }
            });

            const batchResults = await Promise.all(batchPromises);

            for (const result of batchResults) {
              results.push(result);
              completedCount++;

              const phase1Progress = (completedCount / validatedZoneIds.length) * 20;
              sendProgress({
                type: 'domain_complete',
                progress: phase1Progress,
                currentDomain: result.domainName,
                completedDomains: completedCount,
                totalDomains: validatedZoneIds.length,
                domain: result,
                phase: {
                  current: 'api_calls',
                  description: 'Aplicando cambios de reglas en Cloudflare...',
                  progress: phase1Progress
                }
              });
            }

            if (i + BATCH_SIZE < validatedZoneIds.length) {
              await new Promise(resolve => setTimeout(resolve, 300));
            }
          }

          // PHASE 2: VERIFICATION (20-80%)
          sendProgress({
            type: 'phase_update',
            progress: 20,
            totalDomains: validatedZoneIds.length,
            completedDomains: validatedZoneIds.length,
            phase: {
              current: 'verification',
              description: 'Verificando que los cambios se aplicaron correctamente...',
              progress: 20
            }
          });

          let verifiedCount = 0;
          const successfulResults = results.filter(r => r.success);

          for (const result of successfulResults) {
            if (clientSignal && clientSignal.aborted) {
              sendProgress({
                type: 'error',
                progress: 20 + (verifiedCount / successfulResults.length) * 60,
                error: 'Operation cancelled by user'
              });
              controller.close();
              return;
            }

            try {
              let verificationPassed = false;

              if (action === 'clean') {
                verificationPassed = await cloudflareAPI.verifyTemplateRuleApplied(
                  result.zoneId,
                  'all_templates',
                  'cleaned',
                  3
                );
              } else if (action === 'add' && result.templateNames && result.templateNames.length > 0) {
                // Verify that at least one template was added (using friendlyId)
                const verifications = await Promise.all(
                  result.templateNames.map(friendlyId =>
                    cloudflareAPI.verifyTemplateRuleApplied(result.zoneId, friendlyId, 'added', 3)
                  )
                );
                verificationPassed = verifications.some(v => v);
              } else if (action === 'remove' && result.templateNames && result.templateNames.length > 0) {
                // Verify that at least one template was removed (using friendlyId)
                const verifications = await Promise.all(
                  result.templateNames.map(friendlyId =>
                    cloudflareAPI.verifyTemplateRuleApplied(result.zoneId, friendlyId, 'removed', 3)
                  )
                );
                verificationPassed = verifications.some(v => v);
              } else {
                // No templates to verify, mark as passed
                verificationPassed = true;
              }

              if (!verificationPassed) {
                result.success = false;
                result.message = `Verificación falló: cambios no se aplicaron correctamente`;
                result.error = 'Verification timeout';
              }

            } catch (error) {
              result.success = false;
              result.message = `Error en verificación: ${error instanceof Error ? error.message : 'Unknown error'}`;
              result.error = error instanceof Error ? error.message : 'Unknown error';
            }

            verifiedCount++;
            const phase2Progress = 20 + (verifiedCount / successfulResults.length) * 60;

            sendProgress({
              type: 'progress',
              progress: phase2Progress,
              currentDomain: result.domainName,
              completedDomains: verifiedCount,
              totalDomains: successfulResults.length,
              phase: {
                current: 'verification',
                description: `Verificando ${result.domainName}...`,
                progress: phase2Progress
              }
            });
          }

          // PHASE 3: CACHE REFRESH (80-100%)
          sendProgress({
            type: 'phase_update',
            progress: 80,
            totalDomains: validatedZoneIds.length,
            completedDomains: validatedZoneIds.length,
            phase: {
              current: 'cache_refresh',
              description: 'Actualizando información de dominios...',
              progress: 80
            }
          });

          let refreshedCount = 0;
          const successfulVerified = results.filter(r => r.success);

          for (const result of successfulVerified) {
            if (clientSignal && clientSignal.aborted) {
              sendProgress({
                type: 'error',
                progress: 80 + (refreshedCount / successfulVerified.length) * 20,
                error: 'Operation cancelled by user'
              });
              controller.close();
              return;
            }

            try {
              await cloudflareAPI.refreshDomainInfo(result.zoneId);
            } catch (error) {
              console.warn(`Failed to refresh domain info for ${result.domainName}:`, error);
            }

            refreshedCount++;
            const phase3Progress = 80 + (refreshedCount / successfulVerified.length) * 20;

            sendProgress({
              type: 'progress',
              progress: phase3Progress,
              currentDomain: result.domainName,
              completedDomains: refreshedCount,
              totalDomains: successfulVerified.length,
              phase: {
                current: 'cache_refresh',
                description: `Actualizando ${result.domainName}...`,
                progress: phase3Progress
              }
            });
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
            completedDomains: results.length,
            totalDomains: validatedZoneIds.length,
            summary,
            phase: {
              current: 'cache_refresh',
              description: 'Proceso completado',
              progress: 100
            }
          });
        }

        async function processLegacyMode() {

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
        }

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