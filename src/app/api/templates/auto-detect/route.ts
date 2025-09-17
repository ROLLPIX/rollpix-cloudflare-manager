import { NextRequest, NextResponse } from 'next/server';
import { CloudflareAPI } from '@/lib/cloudflare';
import { RuleTemplate } from '@/types/cloudflare';
import { safeReadJsonFile, safeWriteJsonFile } from '@/lib/fileSystem';

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

async function saveRulesTemplates(templates: RuleTemplate[]): Promise<void> {
  const cache: RulesTemplatesCache = {
    templates,
    lastUpdated: new Date().toISOString()
  };
  await safeWriteJsonFile(RULES_TEMPLATES_FILE, cache);
}

// POST - Auto-detect and import templates from existing rules
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { apiToken, forceRefresh = false } = body;

    console.log('[Auto-Detect API] Starting template auto-detection process');

    if (!apiToken) {
      return NextResponse.json({
        success: false,
        error: 'API token is required'
      }, { status: 400 });
    }

    const cloudflareAPI = new CloudflareAPI(apiToken);
    const existingTemplates = await loadRulesTemplates();

    // Get all zones
    const allZones = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const zonesResponse = await cloudflareAPI.getZones(page, 50);
      allZones.push(...zonesResponse.zones);
      hasMore = page < zonesResponse.totalPages;
      page++;
    }

    console.log(`[Auto-Detect API] Found ${allZones.length} zones to analyze`);

    // Collect all rules from all zones
    const allRules: any[] = [];
    const BATCH_SIZE = 5;

    for (let i = 0; i < allZones.length; i += BATCH_SIZE) {
      const batch = allZones.slice(i, i + BATCH_SIZE);

      const batchPromises = batch.map(async (zone) => {
        try {
          const rules = await cloudflareAPI.getZoneSecurityRules(zone.id);
          return rules.map(rule => ({
            ...rule,
            domainName: zone.name,
            zoneId: zone.id
          }));
        } catch (error) {
          console.warn(`[Auto-Detect API] Failed to get rules for zone ${zone.name}:`, error);
          return [];
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          allRules.push(...result.value);
        }
      }

      // Rate limiting delay
      if (i + BATCH_SIZE < allZones.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    console.log(`[Auto-Detect API] Collected ${allRules.length} total rules from ${allZones.length} zones`);

    if (allRules.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          imported: 0,
          updated: 0,
          skipped: 0,
          newTemplates: [],
          message: 'No rules found to analyze for template detection'
        }
      });
    }

    // Perform auto template import
    const importResult = await cloudflareAPI.autoImportTemplates(allRules, existingTemplates.templates);

    console.log(`[Auto-Detect API] Auto-import result:`, {
      imported: importResult.importedTemplates.length,
      updated: importResult.updatedTemplates.length,
      skipped: importResult.skippedRules.length
    });

    // Update templates cache if we have new or updated templates
    if (importResult.importedTemplates.length > 0 || importResult.updatedTemplates.length > 0) {
      const updatedTemplates = [
        ...existingTemplates.templates,
        ...importResult.importedTemplates
      ].map(template => {
        // Apply updates to existing templates
        const updated = importResult.updatedTemplates.find(ut => ut.id === template.id);
        return updated || template;
      });

      await saveRulesTemplates(updatedTemplates);

      console.log(`[Auto-Detect API] Updated templates cache with ${importResult.importedTemplates.length} new and ${importResult.updatedTemplates.length} updated templates`);
    }

    return NextResponse.json({
      success: true,
      data: {
        imported: importResult.importedTemplates.length,
        updated: importResult.updatedTemplates.length,
        skipped: importResult.skippedRules.length,
        newTemplates: importResult.importedTemplates.map(t => ({
          id: t.id,
          friendlyId: t.friendlyId,
          name: t.name,
          version: t.version,
          description: t.description
        })),
        updatedTemplates: importResult.updatedTemplates.map(t => ({
          id: t.id,
          friendlyId: t.friendlyId,
          name: t.name,
          version: t.version
        })),
        totalRulesAnalyzed: allRules.length,
        zonesAnalyzed: allZones.length,
        message: `Auto-detection complete: ${importResult.importedTemplates.length} templates imported, ${importResult.updatedTemplates.length} updated, ${importResult.skippedRules.length} rules skipped`
      }
    });

  } catch (error) {
    console.error('[Auto-Detect API] Error during template auto-detection:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to auto-detect templates'
    }, { status: 500 });
  }
}