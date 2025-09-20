import { RuleTemplate } from '@/types/cloudflare';
import { TemplateRuleMapping } from './ruleMapping';
import { safeWriteJsonFile, safeReadJsonFile } from './fileSystem';

export interface PendingChanges {
  ruleMappings: TemplateRuleMapping[];
  templates: RuleTemplate[];
  removedMappings: string[];
  templateUpdates: RuleTemplate[];
}

export interface RuleMappingCache {
  mappings: TemplateRuleMapping[];
  lastUpdated: string;
}

export interface TemplatesCache {
  templates: RuleTemplate[];
  lastUpdated: string;
}

/**
 * BatchCacheWriter handles atomic file operations for cache files
 * Solves concurrency issues by consolidating all changes and writing once
 */
export class BatchCacheWriter {
  private static instance: BatchCacheWriter;

  public static getInstance(): BatchCacheWriter {
    if (!BatchCacheWriter.instance) {
      BatchCacheWriter.instance = new BatchCacheWriter();
    }
    return BatchCacheWriter.instance;
  }

  /**
   * Apply all pending changes atomically
   */
  async applyChanges(allPendingChanges: PendingChanges[]): Promise<{
    ruleMappingsUpdated: number;
    templatesUpdated: number;
    propagatedDomains: string[];
    success: boolean;
  }> {
    console.log(`[BatchCacheWriter] Processing ${allPendingChanges.length} domain changes...`);

    try {
      // Consolidate all changes
      const consolidated = this.consolidateChanges(allPendingChanges);

      // Apply rule mappings changes (includes propagation)
      const ruleMappingsResult = await this.applyRuleMappingsChanges(consolidated);

      // Apply templates changes
      const templatesResult = await this.applyTemplatesChanges(consolidated);

      console.log(`[BatchCacheWriter] ✅ Successfully applied changes:`, {
        ruleMappings: ruleMappingsResult.count,
        templates: templatesResult.count,
        propagatedDomains: ruleMappingsResult.propagatedDomains.length
      });

      return {
        ruleMappingsUpdated: ruleMappingsResult.count,
        templatesUpdated: templatesResult.count,
        propagatedDomains: ruleMappingsResult.propagatedDomains,
        success: true
      };

    } catch (error) {
      console.error(`[BatchCacheWriter] ❌ Error applying changes:`, error);
      return {
        ruleMappingsUpdated: 0,
        templatesUpdated: 0,
        propagatedDomains: [],
        success: false
      };
    }
  }

  /**
   * Consolidate multiple PendingChanges into a single set of operations
   */
  private consolidateChanges(allChanges: PendingChanges[]): PendingChanges {
    const consolidated: PendingChanges = {
      ruleMappings: [],
      templates: [],
      removedMappings: [],
      templateUpdates: []
    };

    // Deduplicate rule mappings by cloudflareRuleId (keep latest)
    const mappingsMap = new Map<string, TemplateRuleMapping>();
    const removedSet = new Set<string>();

    for (const changes of allChanges) {
      // Process removals first
      for (const ruleId of changes.removedMappings) {
        removedSet.add(ruleId);
        mappingsMap.delete(ruleId);
      }

      // Process additions (overwrites existing)
      for (const mapping of changes.ruleMappings) {
        if (!removedSet.has(mapping.cloudflareRuleId)) {
          mappingsMap.set(mapping.cloudflareRuleId, mapping);
        }
      }
    }

    consolidated.ruleMappings = Array.from(mappingsMap.values());
    consolidated.removedMappings = Array.from(removedSet);

    // Deduplicate templates by ID (keep latest)
    const templatesMap = new Map<string, RuleTemplate>();
    const updatesMap = new Map<string, RuleTemplate>();

    for (const changes of allChanges) {
      // Process new templates
      for (const template of changes.templates) {
        templatesMap.set(template.id, template);
      }

      // Process template updates
      for (const template of changes.templateUpdates) {
        updatesMap.set(template.id, template);
      }
    }

    consolidated.templates = Array.from(templatesMap.values());
    consolidated.templateUpdates = Array.from(updatesMap.values());

    console.log(`[BatchCacheWriter] Consolidated changes:`, {
      ruleMappings: consolidated.ruleMappings.length,
      removedMappings: consolidated.removedMappings.length,
      newTemplates: consolidated.templates.length,
      updatedTemplates: consolidated.templateUpdates.length
    });

    return consolidated;
  }

  /**
   * Apply rule mappings changes to cache file with template propagation
   */
  private async applyRuleMappingsChanges(changes: PendingChanges): Promise<{ count: number; propagatedDomains: string[] }> {
    try {
      // Import batch function from ruleMapping
      const { batchUpdateRuleMappings } = await import('./ruleMapping');

      // Prepare template updates for propagation
      const templateUpdates = changes.templateUpdates.map(template => ({
        id: template.id,
        newVersion: template.version,
        // We don't have excludeZoneId in this context, so propagation affects all domains
      }));

      // Apply all changes atomically including propagation
      const result = await batchUpdateRuleMappings(
        changes.ruleMappings,
        changes.removedMappings,
        templateUpdates
      );

      return {
        count: result.updatedMappings,
        propagatedDomains: result.propagatedDomains
      };

    } catch (error) {
      console.error(`[BatchCacheWriter] Error updating rule mappings:`, error);
      throw error;
    }
  }

  /**
   * Apply templates changes to cache file
   */
  private async applyTemplatesChanges(changes: PendingChanges): Promise<{ count: number }> {
    try {
      // Load current cache
      const currentCache = await this.loadTemplatesCache();

      let templates = [...currentCache.templates];

      // Add new templates
      templates.push(...changes.templates);

      // Update existing templates
      for (const updatedTemplate of changes.templateUpdates) {
        const index = templates.findIndex(t => t.id === updatedTemplate.id);
        if (index !== -1) {
          templates[index] = updatedTemplate;
        } else {
          // If not found, add as new template
          templates.push(updatedTemplate);
        }
      }

      // Remove duplicates by ID (keep latest)
      const templatesMap = new Map<string, RuleTemplate>();
      for (const template of templates) {
        templatesMap.set(template.id, template);
      }
      templates = Array.from(templatesMap.values());

      // Save updated cache
      const updatedCache: TemplatesCache = {
        templates,
        lastUpdated: new Date().toISOString()
      };

      await safeWriteJsonFile('security-rules-templates.json', updatedCache);

      return { count: changes.templates.length + changes.templateUpdates.length };

    } catch (error) {
      console.error(`[BatchCacheWriter] Error updating templates:`, error);
      throw error;
    }
  }

  /**
   * Load current rule mappings cache
   */
  private async loadRuleMappingsCache(): Promise<RuleMappingCache> {
    try {
      return await safeReadJsonFile<RuleMappingCache>('rule-id-mapping.json');
    } catch {
      return {
        mappings: [],
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Load current templates cache
   */
  private async loadTemplatesCache(): Promise<TemplatesCache> {
    try {
      return await safeReadJsonFile<TemplatesCache>('security-rules-templates.json');
    } catch {
      return {
        templates: [],
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Utility method to create empty pending changes
   */
  static createEmptyChanges(): PendingChanges {
    return {
      ruleMappings: [],
      templates: [],
      removedMappings: [],
      templateUpdates: []
    };
  }
}