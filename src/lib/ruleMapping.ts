import { safeReadJsonFile, safeWriteJsonFile } from './fileSystem';

const RULE_MAPPING_FILE = 'rule-id-mapping.json';

export interface TemplateRuleMapping {
  cloudflareRuleId: string;
  templateId: string;
  friendlyId: string;
  version: string;
  appliedAt: string;
  zoneId: string;
  domainName: string;
}

interface RuleMappingCache {
  mappings: TemplateRuleMapping[];
  lastUpdated: string;
}

// In-memory cache for fast lookups
let ruleMappingCache: Map<string, TemplateRuleMapping> | null = null;
let cacheLastLoaded = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function loadRuleMappingCache(): Promise<RuleMappingCache> {
  try {
    return await safeReadJsonFile<RuleMappingCache>(RULE_MAPPING_FILE);
  } catch {
    return {
      mappings: [],
      lastUpdated: new Date().toISOString()
    };
  }
}

async function saveRuleMappingCache(cache: RuleMappingCache): Promise<void> {
  cache.lastUpdated = new Date().toISOString();
  await safeWriteJsonFile(RULE_MAPPING_FILE, cache);

  // Update in-memory cache
  ruleMappingCache = new Map(
    cache.mappings.map(mapping => [mapping.cloudflareRuleId, mapping])
  );
  cacheLastLoaded = Date.now();
}

async function ensureCacheLoaded(): Promise<void> {
  const now = Date.now();

  if (!ruleMappingCache || (now - cacheLastLoaded) > CACHE_TTL) {
    console.log('[RuleMapping] Loading/refreshing rule mapping cache...');
    const cache = await loadRuleMappingCache();
    ruleMappingCache = new Map(
      cache.mappings.map(mapping => [mapping.cloudflareRuleId, mapping])
    );
    cacheLastLoaded = now;
    console.log(`[RuleMapping] Loaded ${cache.mappings.length} rule mappings`);
  }
}

export async function addRuleMapping(mapping: TemplateRuleMapping): Promise<void> {
  console.log(`[RuleMapping] Adding mapping for rule ${mapping.cloudflareRuleId} → template ${mapping.friendlyId}`);

  const cache = await loadRuleMappingCache();

  // Remove any existing mapping for this cloudflare rule ID
  cache.mappings = cache.mappings.filter(m => m.cloudflareRuleId !== mapping.cloudflareRuleId);

  // Add the new mapping
  cache.mappings.push(mapping);

  await saveRuleMappingCache(cache);
}

export async function removeRuleMapping(cloudflareRuleId: string): Promise<void> {
  console.log(`[RuleMapping] Removing mapping for rule ${cloudflareRuleId}`);

  const cache = await loadRuleMappingCache();
  cache.mappings = cache.mappings.filter(m => m.cloudflareRuleId !== cloudflareRuleId);

  await saveRuleMappingCache(cache);
}

export async function getRuleMapping(cloudflareRuleId: string): Promise<TemplateRuleMapping | null> {
  await ensureCacheLoaded();
  return ruleMappingCache!.get(cloudflareRuleId) || null;
}

export async function getTemplateMappingsForZone(zoneId: string): Promise<TemplateRuleMapping[]> {
  await ensureCacheLoaded();
  return Array.from(ruleMappingCache!.values()).filter(mapping => mapping.zoneId === zoneId);
}

export async function getAllTemplateMappings(): Promise<TemplateRuleMapping[]> {
  await ensureCacheLoaded();
  return Array.from(ruleMappingCache!.values());
}

export async function isTemplateRule(cloudflareRuleId: string): Promise<boolean> {
  await ensureCacheLoaded();
  return ruleMappingCache!.has(cloudflareRuleId);
}

export interface RuleClassification {
  type: 'template' | 'custom';
  templateId?: string;
  friendlyId?: string;
  version?: string;
  isOutdated?: boolean;
  appliedAt?: string;
}

export async function classifyRule(cloudflareRuleId: string, currentTemplateVersions: Map<string, string>): Promise<RuleClassification> {
  const mapping = await getRuleMapping(cloudflareRuleId);

  if (!mapping) {
    return { type: 'custom' };
  }

  const currentVersion = currentTemplateVersions.get(mapping.templateId);
  const isOutdated = currentVersion ? mapping.version !== currentVersion : false;

  return {
    type: 'template',
    templateId: mapping.templateId,
    friendlyId: mapping.friendlyId,
    version: mapping.version,
    isOutdated,
    appliedAt: mapping.appliedAt
  };
}

// Utility function to get template IDs set for quick lookups
export async function getTemplateRuleIds(): Promise<Set<string>> {
  await ensureCacheLoaded();
  return new Set(ruleMappingCache!.keys());
}

// Optimized batch classification for multiple rules
export async function classifyRulesBatch(
  ruleIds: string[],
  currentTemplateVersions: Map<string, string>
): Promise<Map<string, RuleClassification>> {
  await ensureCacheLoaded();

  const results = new Map<string, RuleClassification>();

  for (const ruleId of ruleIds) {
    const mapping = ruleMappingCache!.get(ruleId);

    if (!mapping) {
      results.set(ruleId, { type: 'custom' });
      continue;
    }

    const currentVersion = currentTemplateVersions.get(mapping.templateId);
    const isOutdated = currentVersion ? mapping.version !== currentVersion : false;

    results.set(ruleId, {
      type: 'template',
      templateId: mapping.templateId,
      friendlyId: mapping.friendlyId,
      version: mapping.version,
      isOutdated,
      appliedAt: mapping.appliedAt
    });
  }

  return results;
}

// Utility function to get template version map for efficient lookups
export async function getTemplateVersionMap(templates: Array<{ id: string; version: string }>): Promise<Map<string, string>> {
  return new Map(templates.map(t => [t.id, t.version]));
}

// Optimized function to get rule mapping for specific zone
export async function getRuleMappingsForZoneBatch(zoneId: string): Promise<Map<string, TemplateRuleMapping>> {
  await ensureCacheLoaded();

  const zoneMappings = new Map<string, TemplateRuleMapping>();

  for (const [ruleId, mapping] of ruleMappingCache!) {
    if (mapping.zoneId === zoneId) {
      zoneMappings.set(ruleId, mapping);
    }
  }

  return zoneMappings;
}

// Statistics and debugging
export async function getRuleMappingStats(): Promise<{
  totalMappings: number;
  uniqueTemplates: number;
  uniqueZones: number;
  oldestMapping: string;
  newestMapping: string;
}> {
  await ensureCacheLoaded();
  const mappings = Array.from(ruleMappingCache!.values());

  if (mappings.length === 0) {
    return {
      totalMappings: 0,
      uniqueTemplates: 0,
      uniqueZones: 0,
      oldestMapping: '',
      newestMapping: ''
    };
  }

  const uniqueTemplates = new Set(mappings.map(m => m.templateId)).size;
  const uniqueZones = new Set(mappings.map(m => m.zoneId)).size;

  const sortedByDate = mappings.sort((a, b) =>
    new Date(a.appliedAt).getTime() - new Date(b.appliedAt).getTime()
  );

  return {
    totalMappings: mappings.length,
    uniqueTemplates,
    uniqueZones,
    oldestMapping: sortedByDate[0]?.appliedAt || '',
    newestMapping: sortedByDate[sortedByDate.length - 1]?.appliedAt || ''
  };
}