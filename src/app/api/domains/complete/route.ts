import { NextRequest, NextResponse } from 'next/server';
import { CloudflareAPI } from '@/lib/cloudflare';
import { DomainStatus, RuleTemplate, CloudflareRule } from '@/types/cloudflare';
import { safeReadJsonFile, safeWriteJsonFile } from '@/lib/fileSystem';
import { TemplateSynchronizer, SyncResult } from '@/lib/templateSync';
import { BatchCacheWriter, PendingChanges } from '@/lib/batchCacheWriter';
import { isServerlessEnvironment } from '@/lib/memoryCache';

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
    console.warn('[Complete API] Error loading templates cache (expected in serverless), using default:', error);

    // In serverless environments, this is expected - start with empty templates
    const isServerless = isServerlessEnvironment();
    console.log(`[Complete API] Running in ${isServerless ? 'serverless' : 'local'} environment`);

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

  try {
    await safeWriteJsonFile(DOMAIN_CACHE_FILE, cache);
    console.log(`[Complete API] Successfully saved domains cache with ${domains.length} domains`);
  } catch (error) {
    console.warn(`[Complete API] Failed to save domains cache to disk (serverless environment):`, error);
    // In serverless environments like Vercel, we rely on memory cache only
    // This is expected behavior and not an error
  }
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
    // Add defensive check for templates array
    const templates = templatesCache?.templates || [];
    const templateVersionMap = new Map(
      templates.map(t => [t.id, t.version])
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

    console.log(`[Complete API] Processing ${targetZoneIds.length} zones with batch synchronization`);

    const results: DomainStatus[] = [];
    const allSyncResults: SyncResult[] = [];
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

    // NUEVA LÓGICA GLOBAL: Recopilar todas las reglas primero, procesar globalmente después
    console.log(`[Complete API] 🔄 PHASE 1: Collecting all rules from ${targetZoneIds.length} zones`);

    // FASE 1: Recopilar información básica de dominios y reglas
    const domainRulesMap = new Map<string, {
      rules: CloudflareRule[];
      domainInfo: { zoneId: string; name: string };
      basicDomainInfo?: DomainStatus;
    }>();

    for (let i = 0; i < targetZoneIds.length; i += BATCH_SIZE) {
      const batch = targetZoneIds.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(targetZoneIds.length / BATCH_SIZE);

      console.log(`[Complete API] 📥 Collecting batch ${batchNumber}/${totalBatches} (${batch.length} zones)`);

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

      // Rate limiting delay between batches
      if (i + BATCH_SIZE < targetZoneIds.length) {
        console.log(`[Complete API] Waiting ${BATCH_DELAY}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
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

      // Combine basic domain info with sync results
      const completeDomainInfo: DomainStatus = {
        ...basicDomainInfo,
        securityRules: {
          totalRules: syncResult.processedRules.length,
          corporateRules: syncResult.processedRules.length, // All rules are now template rules
          customRules: 0, // Removed custom rules tracking
          hasConflicts: syncResult.processedRules.some(r => r.isOutdated),
          lastAnalyzed: new Date().toISOString(),
          templateRules: syncResult.processedRules.map(r => ({
            friendlyId: r.friendlyId,
            version: r.version,
            isOutdated: r.isOutdated,
            name: r.friendlyId // Use friendlyId as name for now
          }))
        }
      };

      results.push(completeDomainInfo);
      allSyncResults.push(syncResult);

      console.log(`[Complete API] ✅ ${data.domainInfo.name}: Global sync complete (${syncResult.processedRules.length} rules, ${syncResult.processedRules.filter(r => r.isOutdated).length} outdated)`);
    }

    // BATCH PROCESSING: Apply all accumulated changes atomically
    console.log(`[Complete API] 🔄 Applying batch changes from ${allSyncResults.length} sync operations...`);

    let batchResult = {
      ruleMappingsUpdated: 0,
      templatesUpdated: 0,
      propagatedDomains: [] as string[],
      success: true
    };

    try {
      const allPendingChanges = allSyncResults.map(sr => sr.pendingChanges);
      const batchWriter = BatchCacheWriter.getInstance();
      batchResult = await batchWriter.applyChanges(allPendingChanges);

      console.log(`[Complete API] ✅ Batch processing complete:`, {
        ruleMappingsUpdated: batchResult.ruleMappingsUpdated,
        templatesUpdated: batchResult.templatesUpdated,
        propagatedDomains: batchResult.propagatedDomains.length,
        success: batchResult.success
      });
    } catch (error) {
      console.warn(`[Complete API] Batch processing failed (serverless environment):`, error);
      // In serverless environments, we continue without persistent batch changes
      batchResult.success = false;
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

    return NextResponse.json({
      success: true,
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

    // Provide more specific error messages for debugging
    let errorMessage = 'Failed to process domains with batch synchronization';
    let additionalInfo = '';

    if (error instanceof Error) {
      errorMessage = error.message;
      additionalInfo = error.stack || '';
    }

    // Log additional environment info for debugging
    console.error('Environment info:', {
      nodeEnv: process.env.NODE_ENV,
      vercel: process.env.VERCEL,
      vercelEnv: process.env.VERCEL_ENV,
      isServerless: isServerlessEnvironment()
    });

    return NextResponse.json({
      success: false,
      error: errorMessage,
      details: additionalInfo.substring(0, 500), // Limit stack trace length
      environment: {
        serverless: isServerlessEnvironment(),
        platform: process.env.VERCEL ? 'vercel' : 'unknown'
      }
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
    const isServerless = isServerlessEnvironment();
    console.warn(`[Complete API GET] Error loading domains cache (expected in ${isServerless ? 'serverless' : 'local'} environment):`, error);

    // Return empty cache instead of 404 to prevent app from hanging
    // This is expected behavior in serverless environments
    return NextResponse.json({
      success: true,
      data: {
        domains: [],
        totalCount: 0,
        lastUpdate: null,
        hasCompleteData: false,
        serverless: isServerless,
        message: isServerless
          ? 'Running in serverless environment - cache will be populated on first POST request'
          : 'Cache file not found - will be created after first domain refresh'
      }
    });
  }
}