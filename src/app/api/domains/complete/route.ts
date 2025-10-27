import { NextRequest, NextResponse } from 'next/server';
import { CloudflareAPI } from '@/lib/cloudflare';
import { DomainStatus, RuleTemplate, CloudflareRule } from '@/types/cloudflare';
import { safeReadJsonFile, safeWriteJsonFile } from '@/lib/fileSystem';
import { TemplateSynchronizer, SyncResult } from '@/lib/templateSync';
import { BatchCacheWriter, PendingChanges } from '@/lib/batchCacheWriter';
import { progressTracker } from '@/lib/progressTracker';

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
    console.log('[Complete API] Loading rules templates from cache...');
    const result = await safeReadJsonFile<RulesTemplatesCache>(RULES_TEMPLATES_FILE);

    // Defensive check to ensure result has the expected structure
    if (!result || typeof result !== 'object') {
      console.log('[Complete API] Invalid templates cache structure, using default');
      return {
        templates: [],
        lastUpdated: new Date().toISOString()
      };
    }

    // Ensure templates array exists
    if (!Array.isArray(result.templates)) {
      console.log('[Complete API] Templates is not an array, creating empty array');
      result.templates = [];
    }

    console.log(`[Complete API] Loaded ${result.templates.length} templates from cache`);
    return result;
  } catch (error) {
    console.log('[Complete API] Error loading templates cache, using default:', error);
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

async function mergeDomainsToCache(updatedDomains: DomainStatus[]): Promise<void> {
  try {
    // Load existing cache
    const existingCache = await safeReadJsonFile<DomainsCache>(DOMAIN_CACHE_FILE);

    // Create a map of updated domains by zoneId for fast lookup
    const updatedMap = new Map(updatedDomains.map(d => [d.zoneId, d]));

    // Merge: replace updated domains, keep others unchanged
    const mergedDomains = existingCache.domains.map(domain =>
      updatedMap.get(domain.zoneId) || domain
    );

    // Add any new domains that weren't in the cache
    const existingZoneIds = new Set(existingCache.domains.map(d => d.zoneId));
    const newDomains = updatedDomains.filter(d => !existingZoneIds.has(d.zoneId));
    const finalDomains = [...mergedDomains, ...newDomains];

    console.log(`[mergeDomainsToCache] Merged ${updatedDomains.length} updated domains into cache of ${existingCache.domains.length} total domains. Final count: ${finalDomains.length}`);

    // Save merged cache
    const cache: DomainsCache = {
      domains: finalDomains,
      lastUpdate: new Date().toISOString(),
      totalCount: finalDomains.length
    };
    await safeWriteJsonFile(DOMAIN_CACHE_FILE, cache);
  } catch (error) {
    // If cache doesn't exist, just save the new domains
    console.log(`[mergeDomainsToCache] No existing cache found, saving ${updatedDomains.length} domains as new cache`);
    await saveDomainsCache(updatedDomains);
  }
}

// POST - Get complete domain information in unified process
export async function POST(request: NextRequest) {
  let requestId = ''; // Declare outside try block for error handler access

  try {
    const body = await request.json();
    const {
      apiToken,
      zoneIds,
      forceRefresh = false,
      batchSize: customBatchSize,
      batchDelay: customBatchDelay,
      requestId: clientRequestId
    } = body;

    // Use client-provided requestId or generate one
    requestId = clientRequestId || progressTracker.generateRequestId();
    console.log(`[Complete API] Starting request ${requestId}`);

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
    // Add defensive check for templates array
    const templates = templatesCache?.templates || [];
    const templateVersionMap = new Map(
      templates.map(t => [t.id, t.version])
    );

    // Get zones to process
    let targetZoneIds = zoneIds;
    if (!targetZoneIds || targetZoneIds.length === 0) {
      // Phase 1: Getting zone list - update progress from 0% to 100%
      await progressTracker.initProgress(requestId, 0); // Will update total later
      await progressTracker.updatePhase1(requestId, 10);

      // Get all zones with pagination
      const allZones = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const zonesResponse = await cloudflareAPI.getZones(page, 50);
        allZones.push(...zonesResponse.zones);
        hasMore = page < zonesResponse.totalPages;

        // Update Phase 1 progress based on pagination
        const phase1Progress = 10 + Math.min(70, (page / Math.max(1, zonesResponse.totalPages)) * 70);
        await progressTracker.updatePhase1(requestId, phase1Progress);

        page++;
      }

      targetZoneIds = allZones.map(zone => zone.id);
      console.log(`[Complete API] Will process ${targetZoneIds.length} total zones`);

      // Complete Phase 1
      await progressTracker.updatePhase1(requestId, 100);
    }

    console.log(`[Complete API] Processing ${targetZoneIds.length} zones with batch synchronization`);

    // Update total for Phase 2 (don't re-init, just update the total)
    const progress = await progressTracker.getProgress(requestId);
    if (progress) {
      await progressTracker.updateTotal(requestId, targetZoneIds.length);
    } else {
      // If progress doesn't exist yet (direct zone IDs provided), initialize it
      await progressTracker.initProgress(requestId, targetZoneIds.length);
    }

    const results: DomainStatus[] = [];
    const allSyncResults: SyncResult[] = [];
    // Use custom values from settings if provided, otherwise use defaults
    const BATCH_SIZE = customBatchSize || 4; // Optimized for Cloudflare's 1200 req/5min limit (~7 API calls/domain)
    const BATCH_DELAY = customBatchDelay || 6000; // 6 seconds between batches to stay under rate limits

    console.log(`[Complete API] Rate limiting config: BATCH_SIZE=${BATCH_SIZE}, BATCH_DELAY=${BATCH_DELAY}ms`);

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

    // NUEVA LÓGICA GLOBAL: Recopilar todas las reglas primero, procesar globalmente después
    console.log(`[Complete API] 🔄 PHASE 1: Collecting all rules from ${targetZoneIds.length} zones`);

    // FASE 1: Recopilar información básica de dominios y reglas
    const domainRulesMap = new Map<string, {
      rules: CloudflareRule[];
      domainInfo: { zoneId: string; name: string };
      basicDomainInfo?: DomainStatus;
    }>();

    const totalBatches = Math.ceil(targetZoneIds.length / BATCH_SIZE);

    for (let i = 0; i < targetZoneIds.length; i += BATCH_SIZE) {
      const batch = targetZoneIds.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

      console.log(`[Complete API] 📥 Collecting batch ${batchNumber}/${totalBatches} (${batch.length} zones)`);

      // Get first domain name for this batch for progress display
      const firstZone = allZonesMap.get(batch[0]);
      const firstDomainName = firstZone?.name || 'Procesando...';

      const batchPromises = batch.map(async (zoneId: string) => {
        const zone = allZonesMap.get(zoneId);
        if (!zone) {
          console.warn(`[Complete API] Zone ${zoneId} not found in zones map`);
          return null;
        }

        try {
          // Get basic domain info (DNS + security settings)
          const basicDomainInfo = await cloudflareAPI.getCompleteDomainInfo(zoneId, zone.name, new Map());

          // Get rules for this domain
          const rulesData = await cloudflareAPI.getZoneSecurityRules(zoneId);

          return {
            zoneId,
            zone,
            basicDomainInfo,
            rulesData
          };

        } catch (error) {
          console.error(`[Complete API] Error collecting data for zone ${zoneId} (${zone.name}):`, error);
          return null;
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);

      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value) {
          const { zoneId, zone, basicDomainInfo, rulesData } = result.value;

          domainRulesMap.set(zoneId, {
            rules: rulesData,
            domainInfo: { zoneId, name: zone.name },
            basicDomainInfo
          });
        }
      }

      // Update Phase 2 progress after processing this batch
      // Use actual count of successfully processed domains, not estimated count
      const domainsProcessed = domainRulesMap.size;
      await progressTracker.updatePhase2(
        requestId,
        domainsProcessed,
        targetZoneIds.length,
        batchNumber,
        totalBatches,
        firstDomainName
      );

      // Rate limiting delay between batches
      if (i + BATCH_SIZE < targetZoneIds.length) {
        console.log(`[Complete API] Waiting ${BATCH_DELAY}ms before next batch...`);
        await progressTracker.setRateLimitWait(requestId, true);
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
        await progressTracker.setRateLimitWait(requestId, false);
      }
    }

    console.log(`[Complete API] ✅ Collected data from ${domainRulesMap.size} domains`);

    // FASE 2: Procesamiento global de plantillas
    console.log(`[Complete API] 🔄 PHASE 2: Global template synchronization`);

    const synchronizer = new TemplateSynchronizer();
    const simplifiedMap = new Map<string, { rules: CloudflareRule[]; domainInfo: { zoneId: string; name: string } }>();

    for (const [zoneId, data] of domainRulesMap) {
      simplifiedMap.set(zoneId, {
        rules: data.rules,
        domainInfo: data.domainInfo
      });
    }

    const globalSyncResults = await synchronizer.syncRulesGlobally(simplifiedMap);

    // FASE 3: Combinar resultados con información de dominios
    console.log(`[Complete API] 🔄 PHASE 3: Combining results with domain info`);

    for (const [zoneId, data] of domainRulesMap) {
      const syncResult = globalSyncResults.get(zoneId);
      const basicDomainInfo = data.basicDomainInfo;

      if (!syncResult || !basicDomainInfo) {
        console.warn(`[Complete API] Missing sync result or basic info for zone ${zoneId}`);
        continue;
      }

      // Create a map of cloudflareRuleId -> CloudflareRule for efficient lookup
      const rulesDataMap = new Map(data.rules.map(rule => [rule.id, rule]));

      // Combine basic domain info with sync results
      const completeDomainInfo: DomainStatus = {
        ...basicDomainInfo,
        securityRules: {
          totalRules: syncResult.processedRules.length,
          corporateRules: syncResult.processedRules.length, // All rules are now template rules
          customRules: 0, // Removed custom rules tracking
          hasConflicts: syncResult.processedRules.some(r => r.isOutdated),
          lastAnalyzed: new Date().toISOString(),
          templateRules: syncResult.processedRules.map(r => {
            // Get the actual Cloudflare rule data
            const cloudflareRule = rulesDataMap.get(r.ruleId);
            return {
              friendlyId: r.friendlyId,
              version: r.version,
              isOutdated: r.isOutdated,
              name: cloudflareRule?.description || r.friendlyId,
              action: cloudflareRule?.action,
              expression: cloudflareRule?.expression,
              description: cloudflareRule?.description
            };
          })
        }
      };

      results.push(completeDomainInfo);
      allSyncResults.push(syncResult);

      console.log(`[Complete API] ✅ ${data.domainInfo.name}: Global sync complete (${syncResult.processedRules.length} rules, ${syncResult.processedRules.filter(r => r.isOutdated).length} outdated)`);
    }

    // BATCH PROCESSING: Apply all accumulated changes atomically
    console.log(`[Complete API] 🔄 Applying batch changes from ${allSyncResults.length} sync operations...`);
    const allPendingChanges = allSyncResults.map(sr => sr.pendingChanges);
    const batchWriter = BatchCacheWriter.getInstance();
    const batchResult = await batchWriter.applyChanges(allPendingChanges);

    console.log(`[Complete API] ✅ Batch processing complete:`, {
      ruleMappingsUpdated: batchResult.ruleMappingsUpdated,
      templatesUpdated: batchResult.templatesUpdated,
      propagatedDomains: batchResult.propagatedDomains.length,
      success: batchResult.success
    });

    // Final cache save with all results
    // Use merge when refreshing specific domains, full save when refreshing all
    // IMPORTANT: Compare against total available zones (allZonesMap) not targetZoneIds
    // because targetZoneIds is set to zoneIds when selective refresh
    const totalAvailableZones = allZonesMap.size;
    const wasSelectiveRefresh = zoneIds && zoneIds.length > 0 && zoneIds.length < totalAvailableZones;

    console.log(`[Complete API] Cache save decision: zoneIds=${zoneIds?.length || 0}, totalAvailable=${totalAvailableZones}, wasSelectiveRefresh=${wasSelectiveRefresh}`);

    if (wasSelectiveRefresh) {
      console.log(`[Complete API] 💾 Merging ${results.length} updated domains into existing cache...`);
      await mergeDomainsToCache(results);
    } else {
      console.log(`[Complete API] 💾 Saving complete cache with ${results.length} domains...`);
      await saveDomainsCache(results);
    }

    // Calculate summary statistics
    const totalProcessed = results.length;
    const totalRequested = targetZoneIds.length;
    const successRate = totalProcessed > 0 ? Math.round((totalProcessed / totalRequested) * 100) : 0;
    const totalRules = results.reduce((sum, d) => sum + (d.securityRules?.totalRules || 0), 0);
    const totalTemplateRules = results.reduce((sum, d) => sum + (d.securityRules?.corporateRules || 0), 0);
    const totalCustomRules = 0; // No longer tracking custom rules
    const domainsWithConflicts = results.filter(d => d.securityRules?.hasConflicts).length;

    // Template processing statistics from batch results
    const totalNewTemplates = allSyncResults.reduce((sum, sr) => sum + sr.newTemplates.length, 0);
    const totalUpdatedTemplates = allSyncResults.reduce((sum, sr) => sum + sr.updatedTemplates.length, 0);
    const allNewTemplates = allSyncResults.flatMap(sr => sr.newTemplates);
    const allUpdatedTemplates = allSyncResults.flatMap(sr => sr.updatedTemplates);

    const templateImportResult = {
      imported: totalNewTemplates,
      updated: totalUpdatedTemplates,
      skipped: 0, // Not tracked in new system
      propagatedDomains: batchResult.propagatedDomains.length,
      newTemplates: allNewTemplates.map(t => ({
        id: t.id,
        friendlyId: t.friendlyId,
        name: t.name,
        version: t.version
      })),
      updatedTemplates: allUpdatedTemplates.map(t => ({
        id: t.id,
        friendlyId: t.friendlyId,
        name: t.name,
        version: t.version
      }))
    };

    console.log(`[Complete API] ✅ Batch processing complete! ${totalProcessed}/${totalRequested} domains (${successRate}% success rate)`);
    console.log(`[Complete API] 📊 Rules summary: ${totalRules} total (${totalTemplateRules} template, ${totalCustomRules} custom)`);
    console.log(`[Complete API] ⚠️ Conflicts: ${domainsWithConflicts} domains with outdated template rules`);
    console.log(`[Complete API] 🔄 Template sync: ${templateImportResult.imported} new, ${templateImportResult.updated} updated, ${templateImportResult.propagatedDomains} propagated`);

    // Mark progress as completed
    await progressTracker.markCompleted(requestId);

    return NextResponse.json({
      success: true,
      requestId: requestId, // Include requestId for progress polling
      data: {
        domains: results,
        summary: {
          totalDomains: totalProcessed,
          totalRequested: totalRequested,
          successRate: successRate,
          domainsWithTemplateRules: results.filter(d => (d.securityRules?.corporateRules || 0) > 0).length,
          domainsWithCustomRules: 0, // No longer tracking custom rules
          totalRules: totalRules,
          totalTemplateRules: totalTemplateRules,
          totalCustomRules: totalCustomRules,
          domainsWithConflicts: domainsWithConflicts,
          processedBatches: Math.ceil(totalRequested / BATCH_SIZE),
          batchSize: BATCH_SIZE,
          batchProcessing: true, // Flag to indicate batch processing was used
          templateSynchronization: templateImportResult,
          batchResults: {
            ruleMappingsUpdated: batchResult.ruleMappingsUpdated,
            templatesUpdated: batchResult.templatesUpdated,
            propagatedDomains: batchResult.propagatedDomains.length,
            success: batchResult.success
          }
        }
      }
    });

  } catch (error) {
    console.error('Error in batch domain processing:', error);
    if (requestId) {
      await progressTracker.markFailed(requestId, error instanceof Error ? error.message : 'Unknown error');
    }
    return NextResponse.json({
      success: false,
      requestId: requestId || undefined,
      error: 'Failed to process domains with batch synchronization'
    }, { status: 500 });
  }
}

// GET - Get cached complete domain information
export async function GET() {
  try {
    console.log('[Complete API GET] Loading domains cache...');
    const cache = await safeReadJsonFile<DomainsCache>(DOMAIN_CACHE_FILE);

    console.log(`[Complete API GET] Cache loaded: ${cache.domains?.length || 0} domains`);
    return NextResponse.json({
      success: true,
      data: {
        domains: cache.domains || [],
        totalCount: cache.totalCount || 0,
        lastUpdate: cache.lastUpdate,
        hasCompleteData: true
      }
    });

  } catch (error) {
    console.error('[Complete API GET] Error loading complete domains cache:', error);

    // Return empty cache instead of 404 to prevent app from hanging
    return NextResponse.json({
      success: true,
      data: {
        domains: [],
        totalCount: 0,
        lastUpdate: null,
        hasCompleteData: false
      }
    });
  }
}