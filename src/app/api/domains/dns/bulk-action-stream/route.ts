import { NextRequest } from 'next/server';
import { CloudflareAPI } from '@/lib/cloudflare';

interface BulkDNSProgress {
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

// POST - Bulk DNS action with streaming progress
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

  if (!['enable_proxy', 'disable_proxy'].includes(action)) {
    return new Response(
      JSON.stringify({ success: false, error: 'Action must be enable_proxy or disable_proxy' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Create a streaming response
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Helper function to send progress updates
      const sendProgress = (data: BulkDNSProgress) => {
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

              const enabled = action === 'enable_proxy';
              let updatedRecords = 0;

              // Get DNS records for this domain
              try {
                const dnsResponse = await cloudflareAPI.getDNSRecords(domainData.zoneId);
                const dnsRecords = dnsResponse.records;

                // Find root (@) and www records that can be proxied
                const rootRecord = dnsRecords.find((record: any) =>
                  record.name === domainData.domainName &&
                  (record.type === 'A' || record.type === 'CNAME')
                );

                const wwwRecord = dnsRecords.find((record: any) =>
                  record.name === `www.${domainData.domainName}` &&
                  (record.type === 'A' || record.type === 'CNAME')
                );

                const totalRecords = [rootRecord, wwwRecord].filter(Boolean).length;

                if (totalRecords === 0) {
                  // No records found - this is not an error, just inform the user
                  result.success = true;
                  result.message = `Sin registros DNS (@ o www) - El dominio necesita registros A o CNAME para usar proxy`;
                  return result;
                }

                // Update root record if it exists
                if (rootRecord) {
                  try {
                    await cloudflareAPI.updateDNSRecord(
                      domainData.zoneId,
                      rootRecord.id,
                      enabled
                    );
                    updatedRecords++;
                  } catch (error) {
                    console.error(`Error updating root record for ${domainData.domainName}:`, error);
                    result.error = `Error actualizando registro @: ${error instanceof Error ? error.message : 'Unknown error'}`;
                  }
                }

                // Update www record if it exists
                if (wwwRecord) {
                  try {
                    await cloudflareAPI.updateDNSRecord(
                      domainData.zoneId,
                      wwwRecord.id,
                      enabled
                    );
                    updatedRecords++;
                  } catch (error) {
                    console.error(`Error updating www record for ${domainData.domainName}:`, error);
                    if (!result.error) {
                      result.error = `Error actualizando registro www: ${error instanceof Error ? error.message : 'Unknown error'}`;
                    }
                  }
                }
              } catch (dnsError) {
                console.error(`Error fetching DNS records for ${domainData.domainName}:`, dnsError);
                result.success = false;
                result.error = `Error obteniendo registros DNS: ${dnsError instanceof Error ? dnsError.message : 'Unknown error'}`;
                result.message = 'Error al acceder a los registros DNS del dominio';
                return result;
              }

              result.success = updatedRecords > 0;
              result.message = `${updatedRecords} registros actualizados - Proxy ${enabled ? 'habilitado' : 'deshabilitado'}`;

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