import { NextRequest, NextResponse } from 'next/server';
import { CloudflareAPI } from '@/lib/cloudflare';
import { DomainStatus, RuleTemplate } from '@/types/cloudflare';
import { safeReadJsonFile, safeWriteJsonFile } from '@/lib/fileSystem';

const DOMAIN_CACHE_FILE = 'domains-cache.json';
const RULES_TEMPLATES_FILE = 'security-rules-templates.json';

interface DomainsCache {
  domains: DomainStatus[];
  lastUpdate: string;
  totalCount: number;
}

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

async function saveDomainsCache(domains: DomainStatus[]): Promise<void> {
  const cache: DomainsCache = {
    domains,
    lastUpdate: new Date().toISOString(),
    totalCount: domains.length
  };
  await safeWriteJsonFile(DOMAIN_CACHE_FILE, cache);
}

// POST - Get complete domain information in unified process
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { apiToken, zoneIds, forceRefresh = false } = body;

    console.log('[Complete API] Token received:', apiToken ? `${apiToken.substring(0, 8)}...` : 'null');
    if (!apiToken) {
      return NextResponse.json({
        success: false,
        error: 'API token is required'
      }, { status: 400 });
    }

    const cloudflareAPI = new CloudflareAPI(apiToken);
    const templatesCache = await loadRulesTemplates();

    // Create template version map for efficient lookup
    const templateVersionMap = new Map(
      templatesCache.templates.map(t => [t.id, t.version])
    );

    // Get zones to process
    let targetZoneIds = zoneIds;
    if (!targetZoneIds || targetZoneIds.length === 0) {
      // Get all zones with pagination
      const allZones = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const zonesResponse = await cloudflareAPI.getZones(page, 50);
        allZones.push(...zonesResponse.zones);
        hasMore = page < zonesResponse.totalPages;
        page++;
      }

      targetZoneIds = allZones.map(zone => zone.id);
      console.log(`[Complete API] Will process ${targetZoneIds.length} total zones`);
    }

    console.log(`[Complete API] Processing ${targetZoneIds.length} zones with unified strategy`);

    const results: DomainStatus[] = [];
    const BATCH_SIZE = 12; // Optimal batch size for parallel processing
    const BATCH_DELAY = 200; // Delay between batches (ms)

    // Get all zones info once
    const allZonesMap = new Map();
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const zonesResponse = await cloudflareAPI.getZones(page, 50);
      zonesResponse.zones.forEach(zone => allZonesMap.set(zone.id, zone));
      hasMore = page < zonesResponse.totalPages;
      page++;
    }

    // Process zones in batches with unified domain info gathering
    for (let i = 0; i < targetZoneIds.length; i += BATCH_SIZE) {
      const batch = targetZoneIds.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(targetZoneIds.length / BATCH_SIZE);

      const batchStartTime = Date.now();
      console.log(`[Complete API] 🚀 Processing unified batch ${batchNumber}/${totalBatches} (${batch.length} zones)`);

      // Process batch in parallel using unified function
      const batchPromises = batch.map(async (zoneId) => {
        const zone = allZonesMap.get(zoneId);
        if (!zone) {
          console.warn(`[Complete API] Zone ${zoneId} not found in zones map`);
          return null;
        }

        try {
          // Use unified function to get complete domain info
          const completeDomainInfo = await cloudflareAPI.getCompleteDomainInfo(
            zoneId,
            zone.name,
            templateVersionMap
          );

          // Fill in template names for applied rules
          if (completeDomainInfo.securityRules && templatesCache.templates.length > 0) {
            // This would be done in a more efficient way in real implementation
            // For now, we'll leave the names empty as they're not critical for summary view
          }

          console.log(`[Complete API] ✅ ${zone.name}: Unified processing complete`);
          return completeDomainInfo;

        } catch (error) {
          console.error(`[Complete API] Error processing zone ${zoneId} (${zone.name}):`, error);
          return null;
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);
      const batchDuration = Date.now() - batchStartTime;

      // Collect successful results and save to cache progressively
      let successfulInBatch = 0;
      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value) {
          results.push(result.value);
          successfulInBatch++;

          // Save to cache immediately for progressive updates
          try {
            await saveDomainsCache([result.value]);
            console.log(`[Complete API] 💾 Cached domain: ${result.value.domain}`);
          } catch (cacheError) {
            console.warn(`[Complete API] Failed to cache domain ${result.value.domain}:`, cacheError);
          }
        }
      }

      console.log(`[Complete API] ⏱️ Batch ${batchNumber}/${totalBatches} completed in ${batchDuration}ms (${successfulInBatch}/${batch.length} successful)`);

      // Rate limiting delay between batches
      if (i + BATCH_SIZE < targetZoneIds.length) {
        console.log(`[Complete API] Waiting ${BATCH_DELAY}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      }
    }

    // Final cache save with all results
    console.log(`[Complete API] 💾 Saving final cache with ${results.length} complete domains...`);
    await saveDomainsCache(results);

    // Calculate summary statistics
    const totalProcessed = results.length;
    const totalRequested = targetZoneIds.length;
    const successRate = totalProcessed > 0 ? Math.round((totalProcessed / totalRequested) * 100) : 0;
    const totalRules = results.reduce((sum, d) => sum + (d.securityRules?.totalRules || 0), 0);
    const totalTemplateRules = results.reduce((sum, d) => sum + (d.securityRules?.corporateRules || 0), 0);
    const totalCustomRules = results.reduce((sum, d) => sum + (d.securityRules?.customRules || 0), 0);
    const domainsWithConflicts = results.filter(d => d.securityRules?.hasConflicts).length;

    console.log(`[Complete API] ✅ Unified processing complete! ${totalProcessed}/${totalRequested} domains (${successRate}% success rate)`);
    console.log(`[Complete API] 📊 Rules summary: ${totalRules} total (${totalTemplateRules} template, ${totalCustomRules} custom)`);
    console.log(`[Complete API] ⚠️ Conflicts: ${domainsWithConflicts} domains with outdated template rules`);

    return NextResponse.json({
      success: true,
      data: {
        domains: results,
        summary: {
          totalDomains: totalProcessed,
          totalRequested: totalRequested,
          successRate: successRate,
          domainsWithTemplateRules: results.filter(d => (d.securityRules?.corporateRules || 0) > 0).length,
          domainsWithCustomRules: results.filter(d => (d.securityRules?.customRules || 0) > 0).length,
          totalRules: totalRules,
          totalTemplateRules: totalTemplateRules,
          totalCustomRules: totalCustomRules,
          domainsWithConflicts: domainsWithConflicts,
          processedBatches: Math.ceil(totalRequested / BATCH_SIZE),
          batchSize: BATCH_SIZE,
          unifiedProcessing: true // Flag to indicate unified processing was used
        }
      }
    });

  } catch (error) {
    console.error('Error in unified domain processing:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to process domains with unified strategy'
    }, { status: 500 });
  }
}

// GET - Get cached complete domain information
export async function GET() {
  try {
    const cache = await safeReadJsonFile<DomainsCache>(DOMAIN_CACHE_FILE);

    return NextResponse.json({
      success: true,
      data: {
        domains: cache.domains,
        totalCount: cache.totalCount,
        lastUpdate: cache.lastUpdate,
        hasCompleteData: true
      }
    });

  } catch (error) {
    console.error('Error loading complete domains cache:', error);
    return NextResponse.json({
      success: false,
      error: 'No complete domains cache found'
    }, { status: 404 });
  }
}