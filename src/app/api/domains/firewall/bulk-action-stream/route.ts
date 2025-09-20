import { NextRequest } from 'next/server';
import { CloudflareAPI } from '@/lib/cloudflare';

interface BulkFirewallProgress {
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

        sendProgress({
          type: 'progress',
          progress: 0,
          totalDomains: targetDomains.length,
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

        for (let i = 0; i < targetDomains.length; i += BATCH_SIZE) {
          // Check for cancellation
          if (clientSignal && clientSignal.aborted) {
            sendProgress({
              type: 'error',
              progress: (completedCount / targetDomains.length) * 100,
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

            // Send individual domain completion
            sendProgress({
              type: 'domain_complete',
              progress: (completedCount / targetDomains.length) * 100,
              currentDomain: result.domainName,
              completedDomains: completedCount,
              totalDomains: targetDomains.length,
              domain: result
            });
          }

          // Add delay between batches for rate limiting
          if (i + BATCH_SIZE < targetDomains.length) {
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
          totalDomains: targetDomains.length,
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