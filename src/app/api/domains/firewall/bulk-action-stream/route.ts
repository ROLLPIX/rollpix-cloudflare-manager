import { NextRequest } from 'next/server';
import { CloudflareAPI } from '@/lib/cloudflare';

interface BulkFirewallProgress {
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

// POST - Bulk firewall action with streaming progress
export async function POST(request: NextRequest) {
  const apiToken = request.headers.get('x-api-token');
  if (!apiToken) {
    return new Response(
      JSON.stringify({ success: false, error: 'API token is required' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const body = await request.json();
  const { action, targetDomains, signal: clientSignal } = body;

  if (!action || !targetDomains || targetDomains.length === 0) {
    return new Response(
      JSON.stringify({ success: false, error: 'Action and target domains are required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!['enable_under_attack', 'disable_under_attack', 'enable_bot_fight', 'disable_bot_fight'].includes(action)) {
    return new Response(
      JSON.stringify({ success: false, error: 'Action must be enable_under_attack, disable_under_attack, enable_bot_fight, or disable_bot_fight' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Create a streaming response
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Helper function to send progress updates
      const sendProgress = (data: BulkFirewallProgress) => {
        const chunk = encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
        controller.enqueue(chunk);
      };

      try {
        const cloudflareAPI = new CloudflareAPI(apiToken);

        // PHASE 1: API CALLS (0-20%)
        sendProgress({
          type: 'phase_update',
          progress: 0,
          totalDomains: targetDomains.length,
          completedDomains: 0,
          phase: {
            current: 'api_calls',
            description: 'Enviando cambios a Cloudflare...',
            progress: 0
          }
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

        for (let i = 0; i < targetDomains.length; i += BATCH_SIZE) {
          // Check for cancellation
          if (clientSignal && clientSignal.aborted) {
            sendProgress({
              type: 'error',
              progress: (completedCount / targetDomains.length) * 20,
              error: 'Operation cancelled by user'
            });
            controller.close();
            return;
          }

          const batchDomains = targetDomains.slice(i, i + BATCH_SIZE);

          const batchPromises = batchDomains.map(async (domainData: any) => {
            try {
              let result = {
                zoneId: domainData.zoneId,
                domainName: domainData.domainName,
                success: false,
                message: '',
                error: undefined as string | undefined
              };

              if (action === 'enable_under_attack' || action === 'disable_under_attack') {
                const enabled = action === 'enable_under_attack';
                try {
                  await cloudflareAPI.updateZoneSetting(domainData.zoneId, 'security_level', enabled ? 'under_attack' : 'medium');
                  result.success = true;
                  result.message = `Under Attack Mode ${enabled ? 'habilitado' : 'deshabilitado'}`;
                } catch (error) {
                  result.success = false;
                  result.message = `Error al ${enabled ? 'habilitar' : 'deshabilitar'} Under Attack Mode`;
                  result.error = error instanceof Error ? error.message : 'Unknown error';
                }
              } else if (action === 'enable_bot_fight' || action === 'disable_bot_fight') {
                const enabled = action === 'enable_bot_fight';
                try {
                  await cloudflareAPI.updateZoneSetting(domainData.zoneId, 'bot_fight_mode', enabled);
                  result.success = true;
                  result.message = `Bot Fight Mode ${enabled ? 'habilitado' : 'deshabilitado'}`;
                } catch (error) {
                  result.success = false;
                  result.message = `Error al ${enabled ? 'habilitar' : 'deshabilitar'} Bot Fight Mode`;
                  result.error = error instanceof Error ? error.message : 'Unknown error';
                }
              }

              return result;

            } catch (error) {
              return {
                zoneId: domainData.zoneId,
                domainName: domainData.domainName,
                success: false,
                message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

            // Send individual domain completion for Phase 1 (0-20%)
            const phase1Progress = (completedCount / targetDomains.length) * 20;
            sendProgress({
              type: 'domain_complete',
              progress: phase1Progress,
              currentDomain: result.domainName,
              completedDomains: completedCount,
              totalDomains: targetDomains.length,
              domain: result,
              phase: {
                current: 'api_calls',
                description: 'Enviando cambios a Cloudflare...',
                progress: phase1Progress
              }
            });
          }

          // Add delay between batches for rate limiting
          if (i + BATCH_SIZE < targetDomains.length) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }

        // PHASE 2: VERIFICATION (20-80%)
        sendProgress({
          type: 'phase_update',
          progress: 20,
          totalDomains: targetDomains.length,
          completedDomains: targetDomains.length,
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
            // Determine expected value and setting for verification
            let setting: string;
            let expectedValue: any;

            if (action === 'enable_under_attack' || action === 'disable_under_attack') {
              setting = 'security_level';
              expectedValue = action === 'enable_under_attack' ? 'under_attack' : 'medium';
            } else {
              setting = 'bot_fight_mode';
              expectedValue = action === 'enable_bot_fight';
            }

            // Verify the change was applied
            const verified = await cloudflareAPI.verifyZoneSetting(result.zoneId, setting, expectedValue, 3);

            if (!verified) {
              result.success = false;
              result.message = `Verificación falló: cambio no se aplicó correctamente`;
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
          totalDomains: targetDomains.length,
          completedDomains: targetDomains.length,
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
            // Refresh domain info to update cache
            await cloudflareAPI.refreshDomainInfo(result.zoneId);
          } catch (error) {
            console.warn(`Failed to refresh domain info for ${result.domainName}:`, error);
            // Don't fail the operation for cache refresh errors
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
          totalDomains: targetDomains.length,
          summary,
          phase: {
            current: 'cache_refresh',
            description: 'Proceso completado',
            progress: 100
          }
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