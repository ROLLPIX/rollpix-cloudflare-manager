import { NextRequest, NextResponse } from 'next/server';
import { CloudflareAPI } from '@/lib/cloudflare';
import { DomainRuleStatus, RuleConflict, RuleTemplate, ConflictResolution } from '@/types/cloudflare';
import { safeReadJsonFile, safeWriteJsonFile } from '@/lib/fileSystem';
import { classifyRule, getAllTemplateMappings } from '@/lib/ruleMapping';

const DOMAIN_RULES_CACHE_FILE = 'domain-rules-status.json';
const RULES_TEMPLATES_FILE = 'security-rules-templates.json';

interface DomainRulesCache {
  domainStatuses: DomainRuleStatus[];
  lastUpdated: string;
}

interface RulesTemplatesCache {
  templates: RuleTemplate[];
  lastUpdated: string;
}

async function loadDomainRulesCache(): Promise<DomainRulesCache> {
  try {
    return await safeReadJsonFile<DomainRulesCache>(DOMAIN_RULES_CACHE_FILE);
  } catch {
    return {
      domainStatuses: [],
      lastUpdated: new Date().toISOString()
    };
  }
}

async function saveDomainRulesCache(cache: DomainRulesCache): Promise<void> {
  cache.lastUpdated = new Date().toISOString();
  await safeWriteJsonFile(DOMAIN_RULES_CACHE_FILE, cache);
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

// Legacy functions removed - now using optimized ID-based classification
// All rule classification is now done via ruleMapping.ts for O(1) lookups

// POST - Analyze rules for specific zones or all zones
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { apiToken, zoneIds, forceRefresh = false } = body;

    console.log('[Analyze API] Token received:', apiToken ? `${apiToken.substring(0, 8)}...` : 'null');
    if (!apiToken) {
      return NextResponse.json({
        success: false,
        error: 'API token is required'
      }, { status: 400 });
    }

    const cloudflareAPI = new CloudflareAPI(apiToken);
    const templatesCache = await loadRulesTemplates();
    let domainRulesCache = await loadDomainRulesCache();

    // Get zones to analyze
    let targetZoneIds = zoneIds;
    if (!targetZoneIds || targetZoneIds.length === 0) {
      // Analyze all zones with pagination to get ALL zones
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
      console.log(`[Analyze API] Will analyze ${targetZoneIds.length} total zones`);
    }

    const analysisResults: DomainRuleStatus[] = [];

    // Get all zones once instead of in each iteration
    console.log('[Analyze API] Getting zone information for all zones...');
    const allZonesMap = new Map();
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const zonesResponse = await cloudflareAPI.getZones(page, 50);
      zonesResponse.zones.forEach(zone => allZonesMap.set(zone.id, zone));
      hasMore = page < zonesResponse.totalPages;
      page++;
    }

    console.log(`[Analyze API] Processing ${targetZoneIds.length} zones for analysis...`);

    // Function to analyze a single zone
    const analyzeZone = async (zoneId: string): Promise<DomainRuleStatus | null> => {
      const analysisStartTime = Date.now();
      const errors: string[] = [];

      try {
        // Get zone info from our map
        const zone = allZonesMap.get(zoneId);
        if (!zone) {
          console.warn(`[Analyze API] Zone ${zoneId} not found in zones map`);
          return null;
        }

        // Check if we have cached analysis and it's recent
        const existingStatus = domainRulesCache.domainStatuses.find(ds => ds.zoneId === zoneId);
        const cacheAge = existingStatus ? Date.now() - new Date(existingStatus.lastAnalyzed).getTime() : Infinity;
        const cacheValidityMs = 30 * 60 * 1000; // 30 minutes

        if (!forceRefresh && existingStatus && cacheAge < cacheValidityMs) {
          console.log(`[Analyze API] Using cached data for zone ${zoneId} (${zone.name})`);
          return existingStatus;
        }

        console.log(`[Analyze API] Analyzing zone ${zoneId} (${zone.name})...`);

        // Get only rule summaries (metadata) for fast processing
        const ruleSummaries = await cloudflareAPI.getZoneSecurityRulesSummary(zoneId);
        console.log(`[Analyze API] Found ${ruleSummaries.length} rules to analyze for zone ${zone.name}`);

        // Create version map for templates
        const templateVersionMap = new Map(
          templatesCache.templates.map(t => [t.id, t.version])
        );

        // Analyze rules using O(1) ID lookup
        const appliedRules = [];
        const customRules = [];

        for (const ruleSummary of ruleSummaries) {
          try {
            // Use fast ID lookup to classify rule
            const classification = await classifyRule(ruleSummary.id, templateVersionMap);

            if (classification.type === 'template' && classification.templateId) {
              // Find template details
              const template = templatesCache.templates.find(t => t.id === classification.templateId);

              if (template) {
                appliedRules.push({
                  ruleId: template.id,
                  ruleName: template.name,
                  version: classification.version!,
                  status: classification.isOutdated ? 'outdated' as const : 'active' as const,
                  cloudflareRulesetId: ruleSummary.rulesetId,
                  cloudflareRuleId: ruleSummary.id,
                  rulesetName: ruleSummary.rulesetName,
                  friendlyId: classification.friendlyId,
                  confidence: 1.0, // High confidence from ID mapping
                  appliedAt: classification.appliedAt || new Date().toISOString()
                });

                console.log(`[Analyze API] ✅ Template rule found: ${classification.friendlyId} v${classification.version} (${classification.isOutdated ? 'outdated' : 'current'})`);
              } else {
                errors.push(`Template not found for ID: ${classification.templateId}`);
                console.warn(`[Analyze API] ⚠️ Template ${classification.templateId} not found in cache`);
              }
            } else {
              // Custom rule - we only need basic info, no expression comparison needed
              customRules.push({
                cloudflareRulesetId: ruleSummary.rulesetId,
                cloudflareRuleId: ruleSummary.id,
                rulesetName: ruleSummary.rulesetName,
                expression: '', // We don't need the full expression for analysis
                action: ruleSummary.action || 'unknown',
                description: ruleSummary.description,
                isLikelyTemplate: false,
                estimatedComplexity: 'unknown' as const // We can't estimate without full expression
              });

              console.log(`[Analyze API] 📝 Custom rule found: ${ruleSummary.id}`);
            }
          } catch (error) {
            console.error(`[Analyze API] Error classifying rule ${ruleSummary.id}:`, error);
            errors.push(`Error classifying rule ${ruleSummary.id}: ${error}`);
          }
        }

        const processingTimeMs = Date.now() - analysisStartTime;
        const totalRulesProcessed = ruleSummaries.length;
        const templatesMatched = appliedRules.length;

        const domainStatus: DomainRuleStatus = {
          zoneId,
          domainName: zone.name,
          appliedRules,
          customRules,
          lastAnalyzed: new Date().toISOString(),
          analysisMetadata: {
            processingTimeMs,
            rulesProcessed: totalRulesProcessed,
            templatesMatched,
            errors: errors.length > 0 ? errors : undefined
          }
        };

        console.log(`[Analyze API] ✅ Completed analysis for zone ${zoneId} (${zone.name}): ${appliedRules.length} template rules, ${customRules.length} custom rules in ${processingTimeMs}ms`);
        return domainStatus;

      } catch (error) {
        console.error(`[Analyze API] Error analyzing zone ${zoneId}:`, error);
        return null;
      }
    };

    // Process zones in parallel batches for better performance
    const BATCH_SIZE = 12; // Optimal batch size for Cloudflare API rate limits
    const BATCH_DELAY = 250; // Delay between batches (ms)

    console.log(`[Analyze API] Processing in batches of ${BATCH_SIZE} zones with ${BATCH_DELAY}ms delay between batches`);

    for (let i = 0; i < targetZoneIds.length; i += BATCH_SIZE) {
      const batch = targetZoneIds.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(targetZoneIds.length / BATCH_SIZE);

      const batchStartTime = Date.now();
      console.log(`[Analyze API] 🚀 Processing batch ${batchNumber}/${totalBatches} (${batch.length} zones) - Progress: ${Math.round((i / targetZoneIds.length) * 100)}%`);

      // Process batch in parallel
      const batchResults = await Promise.allSettled(
        batch.map(zoneId => analyzeZone(zoneId))
      );

      const batchDuration = Date.now() - batchStartTime;
      console.log(`[Analyze API] ⏱️ Batch ${batchNumber}/${totalBatches} completed in ${batchDuration}ms`);

      // Collect successful results and update cache progressively
      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value) {
          analysisResults.push(result.value);

          // Update cache immediately for this zone
          const existingIndex = domainRulesCache.domainStatuses.findIndex(ds => ds.zoneId === result.value!.zoneId);
          if (existingIndex !== -1) {
            domainRulesCache.domainStatuses[existingIndex] = result.value;
          } else {
            domainRulesCache.domainStatuses.push(result.value);
          }
        }
      }

      // Save progress after each batch
      try {
        await saveDomainRulesCache(domainRulesCache);
        console.log(`[Analyze API] Saved progress after batch ${batchNumber}/${totalBatches}`);
      } catch (saveError) {
        console.warn(`[Analyze API] Failed to save progress after batch ${batchNumber}:`, saveError);
      }

      // Rate limiting delay between batches
      if (i + BATCH_SIZE < targetZoneIds.length) {
        console.log(`[Analyze API] Waiting ${BATCH_DELAY}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      }
    }

    // Final cache save
    console.log(`[Analyze API] 💾 Saving final cache with ${analysisResults.length} domain statuses...`);
    await saveDomainRulesCache(domainRulesCache);

    // With the new ID-based system, conflicts are detected during rule application, not post-analysis
    console.log(`[Analyze API] ✅ Analysis complete using optimized ID-based classification`);
    const allConflicts: RuleConflict[] = []; // No post-analysis conflicts needed

    // Count actual template rules vs outdated ones for summary
    const outdatedRules = analysisResults.filter(ds =>
      ds.appliedRules.some(rule => rule.status === 'outdated')
    ).length;

    // Enhanced summary with performance metrics
    const totalProcessed = analysisResults.length;
    const totalRequested = targetZoneIds.length;
    const successRate = totalProcessed > 0 ? Math.round((totalProcessed / totalRequested) * 100) : 0;
    const totalRules = analysisResults.reduce((sum, ds) => sum + ds.appliedRules.length + ds.customRules.length, 0);
    const totalTemplateRules = analysisResults.reduce((sum, ds) => sum + ds.appliedRules.length, 0);
    const totalCustomRules = analysisResults.reduce((sum, ds) => sum + ds.customRules.length, 0);

    console.log(`[Analyze API] ✅ Analysis complete! Processed ${totalProcessed}/${totalRequested} domains (${successRate}% success rate)`);
    console.log(`[Analyze API] 📊 Rules summary: ${totalRules} total (${totalTemplateRules} template, ${totalCustomRules} custom)`);
    console.log(`[Analyze API] 🔄 Template rules: ${totalTemplateRules - outdatedRules} current, ${outdatedRules} outdated`);

    return NextResponse.json({
      success: true,
      data: {
        domainStatuses: analysisResults,
        conflicts: allConflicts,
        summary: {
          totalDomains: totalProcessed,
          totalRequested: totalRequested,
          successRate: successRate,
          domainsWithCorporateRules: analysisResults.filter(ds => ds.appliedRules.length > 0).length,
          domainsWithCustomRules: analysisResults.filter(ds => ds.customRules.length > 0).length,
          totalRules: totalRules,
          totalTemplateRules: totalTemplateRules,
          totalCustomRules: totalCustomRules,
          currentTemplateRules: totalTemplateRules - outdatedRules,
          outdatedTemplateRules: outdatedRules,
          processedBatches: Math.ceil(totalRequested / BATCH_SIZE),
          batchSize: BATCH_SIZE,
          optimizedAnalysis: true // Flag to indicate new optimized analysis was used
        }
      }
    });
  } catch (error) {
    console.error('Error analyzing security rules:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to analyze security rules'
    }, { status: 500 });
  }
}

// GET - Get cached analysis results
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const zoneId = searchParams.get('zoneId');

    const cache = await loadDomainRulesCache();
    
    if (zoneId) {
      const domainStatus = cache.domainStatuses.find(ds => ds.zoneId === zoneId);
      if (!domainStatus) {
        return NextResponse.json({
          success: false,
          error: 'Domain analysis not found'
        }, { status: 404 });
      }
      return NextResponse.json({
        success: true,
        data: domainStatus
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        domainStatuses: cache.domainStatuses,
        lastUpdated: cache.lastUpdated
      }
    });
  } catch (error) {
    console.error('Error loading security rules analysis:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to load security rules analysis'
    }, { status: 500 });
  }
}