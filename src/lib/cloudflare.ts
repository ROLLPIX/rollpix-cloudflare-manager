import { CloudflareZone, CloudflareDNSRecord, CloudflareApiResponse, DomainStatus, CloudflareRuleset, CloudflareRule, RuleTemplate } from '@/types/cloudflare';
import { createCloudflareRuleName, parseCloudflareRuleName, isTemplateRule, compareVersions, isTemplateFormat, parseTemplateFormat, createTemplateFromRule, findTemplateByFriendlyId, generateNextFriendlyId } from './ruleUtils';
import { addRuleMapping, removeRuleMapping, classifyRule, classifyRulesBatch } from './ruleMapping';

const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';

// Helper function to map template actions to Cloudflare actions
function mapTemplateActionToCloudflareAction(templateAction: string): string {
  switch (templateAction) {
    case 'challenge':
      return 'managed_challenge';
    default:
      return templateAction;
  }
}

export class CloudflareAPI {
  private apiToken: string;

  constructor(apiToken: string) {
    this.apiToken = apiToken;
  }

  private async makeRequest<T>(endpoint: string, options: RequestInit = {}, throwOnError = true): Promise<any> {
    const response = await fetch(`${CLOUDFLARE_API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      if (throwOnError) {
        const errorText = await response.text();

        // Don't log 403 errors for individual ruleset access - it's expected when token has limited scope
        const isRulesetAccess = endpoint.includes('/rulesets/') && response.status === 403;
        if (!isRulesetAccess) {
          console.error(`Error en la API de Cloudflare (${response.status}) for endpoint: ${endpoint}`, errorText);
        }

        throw new Error(`Error en la API de Cloudflare: ${response.status} - ${errorText}`);
      } else {
        return response; // Return the failed response for manual handling
      }
    }

    try {
      return await response.json();
    } catch (error) {
      console.error(`[CloudflareAPI] JSON parsing error for endpoint ${endpoint}:`, error);
      console.error(`[CloudflareAPI] Response status: ${response.status} ${response.statusText}`);
      console.error(`[CloudflareAPI] Response headers:`, Object.fromEntries(response.headers.entries()));
      throw new Error(`JSON parsing error for ${endpoint}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getZone(zoneId: string): Promise<CloudflareZone> {
    const response = await this.makeRequest<CloudflareZone>(`/zones/${zoneId}`);
    return response.result;
  }

  async getZones(page: number = 1, perPage: number = 50): Promise<{ zones: CloudflareZone[], totalCount: number, totalPages: number }> {
    const response = await this.makeRequest<CloudflareZone[]>(`/zones?page=${page}&per_page=${perPage}`);
    return {
      zones: response.result,
      totalCount: response.result_info?.total_count || 0,
      totalPages: response.result_info?.total_pages || 1
    };
  }

  async getDNSRecords(zoneId: string, page: number = 1, perPage: number = 100): Promise<{ records: CloudflareDNSRecord[], totalCount: number }> {
    const response = await this.makeRequest<CloudflareDNSRecord[]>(`/zones/${zoneId}/dns_records?page=${page}&per_page=${perPage}`);
    return {
      records: response.result,
      totalCount: response.result_info?.total_count || 0
    };
  }

  async updateDNSRecord(zoneId: string, recordId: string, proxied: boolean): Promise<CloudflareDNSRecord> {
    const response = await this.makeRequest<CloudflareDNSRecord>(`/zones/${zoneId}/dns_records/${recordId}`, {
      method: 'PATCH',
      body: JSON.stringify({ proxied }),
    });
    return response.result;
  }

  async getDomainStatuses(
    page?: number, 
    perPage?: number, 
    zones?: CloudflareZone[],
    onProgress?: (completed: number, total: number) => void
  ): Promise<{ domains: DomainStatus[], totalCount: number, totalPages: number }> {
    let zonesToProcess: CloudflareZone[] = zones || [];
    let totalCount = 0;
    let totalPages = 0;

    if (!zones) {
      const zonesResponse = await this.getZones(page, perPage);
      zonesToProcess = zonesResponse.zones;
      totalCount = zonesResponse.totalCount;
      totalPages = zonesResponse.totalPages;
    }

    const domainStatuses: DomainStatus[] = [];
    const batchSize = 5;
    let completedCount = 0;

    for (let i = 0; i < zonesToProcess.length; i += batchSize) {
      const batch = zonesToProcess.slice(i, i + batchSize);
      const batchPromises = batch.map(async (zone) => {
        try {
          const [recordsResponse, securitySettings] = await Promise.all([
            this.getDNSRecords(zone.id),
            this.getSecuritySettings(zone.id)
          ]);

          const records = recordsResponse.records;
          const rootRecord = records.find(record => record.name === zone.name && (record.type === 'A' || record.type === 'CNAME'));
          const wwwRecord = records.find(record => record.name === `www.${zone.name}` && (record.type === 'A' || record.type === 'CNAME'));

          return {
            domain: zone.name,
            zoneId: zone.id,
            rootRecord,
            wwwRecord,
            rootProxied: rootRecord?.proxied || false,
            wwwProxied: wwwRecord?.proxied || false,
            underAttackMode: securitySettings.underAttackMode,
            botFightMode: securitySettings.botFightMode,
          } as DomainStatus;
        } catch (error) {
          console.error(`Failed to process zone ${zone.name}:`, error);
          return null;
        }
      });

      const results = await Promise.all(batchPromises);
      domainStatuses.push(...results.filter((status): status is DomainStatus => status !== null));
      
      completedCount += batch.length;
      onProgress?.(completedCount, zonesToProcess.length);

      if (i + batchSize < zonesToProcess.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    return {
      domains: domainStatuses,
      totalCount: totalCount,
      totalPages: totalPages
    };
  }

  async toggleProxy(zoneId: string, recordId: string, proxied: boolean): Promise<CloudflareDNSRecord> {
    return this.updateDNSRecord(zoneId, recordId, proxied);
  }

  async getSecuritySettings(zoneId: string): Promise<{ underAttackMode: boolean; botFightMode: boolean }> {
    let underAttackMode = false;
    let botFightMode = false;

    try {
      const securityLevelResponse = await this.makeRequest<{ value: string }>(`/zones/${zoneId}/settings/security_level`);
      if (securityLevelResponse && securityLevelResponse.result) {
        underAttackMode = securityLevelResponse.result.value === 'under_attack';
      }
    } catch (error) {
      console.error(`Error getting security_level for zone ${zoneId}:`, error);
    }

    // Try Bot Management API endpoint first (requires Bot Management Read permission)
    try {
      const botManagementResponse = await this.makeRequest<any>(`/zones/${zoneId}/bot_management`);
      if (botManagementResponse && botManagementResponse.result) {
        const result = botManagementResponse.result;
        // Check for Bot Fight Mode - be more precise to avoid false positives
        // Basic Bot Fight Mode is primarily indicated by fight_mode
        botFightMode = !!(result.fight_mode);

        // If fight_mode is not set, check for other reliable indicators
        if (!botFightMode) {
          // Super Bot Fight Mode indicators (more conservative)
          const hasSuperBotFight = !!(
            (result.sbfm_likely_automated && result.sbfm_likely_automated !== 'allow') ||
            (result.sbfm_definitely_automated && result.sbfm_definitely_automated !== 'allow')
          );

          // Only consider it Bot Fight Mode if we have clear Super Bot Fight indicators
          // and enable_js is also true (more conservative approach)
          if (hasSuperBotFight && result.enable_js) {
            botFightMode = true;
          }
        }

        console.log(`[Bot Fight Mode - Official API] Zone ${zoneId}: botFightMode=${botFightMode}`);
        return { underAttackMode, botFightMode };
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('403')) {
        console.warn(`[Bot Fight Mode] Token lacks 'Bot Management Read' permission for zone ${zoneId}. Trying fallback methods...`);
      } else {
        console.warn(`[Bot Fight Mode] API error for zone ${zoneId}:`, error instanceof Error ? error.message : error);
      }
    }

    // FALLBACK 1: Try legacy zone settings endpoints (some accounts may still have these)
    const fallbackEndpoints = [
      { path: `/zones/${zoneId}/settings/bot_fight_mode`, property: 'value', expected: 'on' },
      { path: `/zones/${zoneId}/settings/bfm`, property: 'value', expected: 'on' },
      { path: `/zones/${zoneId}/settings/challenge_passage`, property: 'value', expected: 'on' }
    ];

    for (const endpoint of fallbackEndpoints) {
      try {
        const response = await this.makeRequest<any>(endpoint.path);
        if (response && response.result) {
          const value = response.result[endpoint.property];
          if (value === endpoint.expected) {
            botFightMode = true;
            console.log(`[Bot Fight Mode - Fallback] Zone ${zoneId}: Found via ${endpoint.path} = ${value}`);
            return { underAttackMode, botFightMode };
          }
        }
      } catch (fallbackError) {
        // Continue to next fallback
        continue;
      }
    }

    // FALLBACK 2: Check if security level indicates Bot Fight Mode
    // Some accounts may have this integrated into security level
    try {
      const securityLevelResponse = await this.makeRequest<any>(`/zones/${zoneId}/settings/security_level`);
      if (securityLevelResponse && securityLevelResponse.result) {
        const securityLevel = securityLevelResponse.result.value;
        // Some accounts may show 'high' or 'under_attack' when Bot Fight Mode is enabled
        if (securityLevel === 'high' || securityLevel === 'under_attack') {
          // This is an assumption - we can't be 100% sure without Bot Management API
          console.log(`[Bot Fight Mode - Inference] Zone ${zoneId}: Inferred from security_level=${securityLevel} (not definitive)`);
        }
      }
    } catch (error) {
      // Ignore errors on this fallback
    }

    // If all fallbacks fail, default to false but log the limitation
    console.warn(`[Bot Fight Mode] Zone ${zoneId}: Unable to determine Bot Fight Mode status. Token may lack 'Bot Management Read' permission.`);
    botFightMode = false;

    return {
      underAttackMode,
      botFightMode
    };
  }

  // Unified function to get complete domain information (DNS + Security + Rules)
  async getCompleteDomainInfo(zoneId: string, zoneName: string, templateVersionMap: Map<string, string>): Promise<DomainStatus> {
    const startTime = Date.now();
    console.log(`[CloudflareAPI] Getting complete domain info for ${zoneName} (${zoneId})`);

    try {
      // Execute all API calls in parallel for maximum efficiency
      const [dnsData, securityData, rulesData] = await Promise.all([
        this.getDNSRecords(zoneId, 1, 100),
        this.getSecuritySettings(zoneId),
        this.getZoneSecurityRules(zoneId) // Use full rules data for description parsing
      ]);

      console.log(`[CloudflareAPI] ${zoneName}: Got ${dnsData.records.length} DNS records, ${rulesData.length} rules`);

      // Process DNS records
      const rootRecord = dnsData.records.find(record =>
        record.name === zoneName && (record.type === 'A' || record.type === 'CNAME')
      );
      const wwwRecord = dnsData.records.find(record =>
        record.name === `www.${zoneName}` && (record.type === 'A' || record.type === 'CNAME')
      );

      const rootProxied = rootRecord?.proxied || false;
      const wwwProxied = wwwRecord?.proxied || false;

      // Classify rules using description parsing (same as bulk analysis fix)
      const appliedRules = [];
      const customRules = [];

      if (rulesData.length > 0) {
        console.log(`[CloudflareAPI] ${zoneName}: Classifying ${rulesData.length} rules using description parsing`);

        // Load templates for friendlyId lookup
        try {
          const templatesCache = await import('@/lib/fileSystem').then(fs =>
            fs.safeReadJsonFile('security-rules-templates.json')
          ).catch(() => ({ templates: [] }));

          for (const rule of rulesData) {
            // Use description parsing to classify rule (same method as fixed bulk analysis)
            const parsed = parseCloudflareRuleName(rule.description || '');

            if (parsed) {
              // This is a template rule - find the template by friendlyId
              const template = templatesCache.templates?.find((t: any) => t.friendlyId === parsed.friendlyId);

              if (template) {
                // Check if version is outdated
                const currentVersion = templateVersionMap.get(template.id);
                const isOutdated = currentVersion ? parsed.version !== currentVersion : false;

                appliedRules.push({
                  ruleId: template.id,
                  ruleName: template.name,
                  version: parsed.version,
                  status: isOutdated ? 'outdated' as const : 'active' as const,
                  cloudflareRulesetId: rule.rulesetId || 'unknown',
                  cloudflareRuleId: rule.id,
                  rulesetName: 'Custom Rules',
                  friendlyId: parsed.friendlyId,
                  confidence: 1.0,
                  appliedAt: new Date().toISOString()
                });

                console.log(`[CloudflareAPI] ${zoneName}: ✅ Template rule found: ${parsed.friendlyId} v${parsed.version} (${isOutdated ? 'outdated' : 'current'})`);
              } else {
                console.warn(`[CloudflareAPI] ${zoneName}: ⚠️ Template ${parsed.friendlyId} not found, treating as custom`);

                // Treat as custom rule if template not found
                customRules.push({
                  cloudflareRulesetId: rule.rulesetId || 'unknown',
                  cloudflareRuleId: rule.id,
                  rulesetName: 'Custom Rules',
                  expression: rule.expression || '',
                  action: rule.action || 'unknown',
                  description: rule.description || 'No description',
                  isLikelyTemplate: true,
                  estimatedComplexity: 'simple' as const
                });
              }
            } else {
              // Custom rule - not from template system
              customRules.push({
                cloudflareRulesetId: rule.rulesetId || 'unknown',
                cloudflareRuleId: rule.id,
                rulesetName: 'Custom Rules',
                action: rule.action || 'unknown',
                description: rule.description || 'No description',
                isLikelyTemplate: false,
                estimatedComplexity: 'complex' as const
              });

              console.log(`[CloudflareAPI] ${zoneName}: 📝 Custom rule found: ${rule.id}`);
            }
          }
        } catch (error) {
          console.error(`[CloudflareAPI] ${zoneName}: Error in rule classification:`, error);
          // Fallback: treat all rules as custom
          for (const rule of rulesData) {
            customRules.push({
              cloudflareRulesetId: rule.rulesetId || 'unknown',
              cloudflareRuleId: rule.id,
              rulesetName: 'Custom Rules',
              expression: rule.expression || '',
              action: rule.action || 'unknown',
              description: rule.description || 'No description',
              isLikelyTemplate: false,
              estimatedComplexity: 'unknown' as const
            });
          }
        }
      }

      const processingTime = Date.now() - startTime;
      console.log(`[CloudflareAPI] ✅ ${zoneName}: Complete info processed in ${processingTime}ms (${appliedRules.length} template, ${customRules.length} custom rules)`);

      // Build complete domain status
      const domainStatus: DomainStatus = {
        domain: zoneName,
        zoneId,
        rootRecord,
        wwwRecord,
        rootProxied,
        wwwProxied,
        underAttackMode: securityData.underAttackMode,
        botFightMode: securityData.botFightMode,
        securityRules: {
          totalRules: appliedRules.length + customRules.length,
          corporateRules: appliedRules.length,
          customRules: customRules.length,
          hasConflicts: appliedRules.some(rule => rule.status === 'outdated'),
          lastAnalyzed: new Date().toISOString(),
          templateRules: appliedRules.map(rule => ({
            friendlyId: rule.friendlyId,
            version: rule.version,
            isOutdated: rule.status === 'outdated',
            name: rule.ruleName
          }))
        }
      };

      return domainStatus;

    } catch (error) {
      console.error(`[CloudflareAPI] Error getting complete domain info for ${zoneName}:`, error);

      // Return basic domain info on error
      return {
        domain: zoneName,
        zoneId,
        rootProxied: false,
        wwwProxied: false,
        underAttackMode: false,
        botFightMode: false
      };
    }
  }

  // Rulesets API methods
  async getZoneRulesets(zoneId: string, phase?: string): Promise<CloudflareRuleset[]> {
    const url = phase
      ? `/zones/${zoneId}/rulesets?phase=${phase}`
      : `/zones/${zoneId}/rulesets`;
    const response = await this.makeRequest<CloudflareRuleset[]>(url);
    return response.result;
  }

  async getRuleset(rulesetId: string): Promise<CloudflareRuleset> {
    const response = await this.makeRequest<CloudflareRuleset>(`/rulesets/${rulesetId}`);
    return response.result;
  }

  async getZoneRuleset(zoneId: string, rulesetId: string): Promise<CloudflareRuleset> {
    console.log(`[CloudflareAPI] Getting detailed ruleset ${rulesetId} for zone ${zoneId}`);

    // First get basic ruleset info to get the current version
    const basicResponse = await this.makeRequest<CloudflareRuleset>(`/zones/${zoneId}/rulesets/${rulesetId}`);
    const version = basicResponse.result.version || 'latest';

    console.log(`[CloudflareAPI] Got ruleset version: ${version}, now getting full ruleset with rules`);

    // Now get the full ruleset with rules using the version-specific endpoint
    const response = await this.makeRequest<CloudflareRuleset>(`/zones/${zoneId}/rulesets/${rulesetId}/versions/${version}`);

    console.log(`[CloudflareAPI] Full ruleset with rules:`, response.result);
    console.log(`[CloudflareAPI] Rules count: ${response.result?.rules?.length || 0}`);

    // If rules is still undefined, initialize as empty array
    if (!response.result.rules) {
      console.log(`[CloudflareAPI] Rules property is undefined, initializing as empty array`);
      response.result.rules = [];
    }

    return response.result;
  }

  async createZoneRuleset(zoneId: string, ruleset: Partial<CloudflareRuleset>): Promise<CloudflareRuleset> {
    const response = await this.makeRequest<CloudflareRuleset>(`/zones/${zoneId}/rulesets`, {
      method: 'POST',
      body: JSON.stringify(ruleset),
    });
    return response.result;
  }

  async updateZoneRuleset(zoneId: string, rulesetId: string, ruleset: Partial<CloudflareRuleset>): Promise<CloudflareRuleset> {
    const response = await this.makeRequest<CloudflareRuleset>(`/zones/${zoneId}/rulesets/${rulesetId}`, {
      method: 'PUT',
      body: JSON.stringify(ruleset),
    });
    return response.result;
  }

  async deleteZoneRuleset(zoneId: string, rulesetId: string): Promise<void> {
    await this.makeRequest(`/zones/${zoneId}/rulesets/${rulesetId}`, {
      method: 'DELETE',
    });
  }

  // Rule management within rulesets
  async addRuleToZone(zoneId: string, rule: Partial<CloudflareRule>, phase = 'http_request_firewall_custom'): Promise<CloudflareRuleset> {
    console.log(`[CloudflareAPI] Adding rule to zone ${zoneId} for phase ${phase}`);
    console.log(`[CloudflareAPI] Rule to add:`, rule);

    // First, get or create the appropriate ruleset for the zone
    const rulesets = await this.getZoneRulesets(zoneId, phase);
    console.log(`[CloudflareAPI] Found ${rulesets.length} rulesets for phase ${phase}`);

    let targetRuleset = rulesets.find(rs => rs.phase === phase);

    if (!targetRuleset) {
      // Create a new ruleset for this phase
      console.log(`[CloudflareAPI] No existing ruleset found, creating new one for phase ${phase}`);
      targetRuleset = await this.createZoneRuleset(zoneId, {
        name: `Custom ${phase} rules`,
        kind: 'zone',
        phase: phase,
        rules: [rule as CloudflareRule]
      });
      console.log(`[CloudflareAPI] Created new ruleset:`, targetRuleset);
    } else {
      // Use the direct "add rule to ruleset" endpoint instead of updating the entire ruleset
      console.log(`[CloudflareAPI] Adding rule directly to existing ruleset ${targetRuleset.id}`);

      const response = await this.makeRequest<CloudflareRuleset>(`/zones/${zoneId}/rulesets/${targetRuleset.id}/rules`, {
        method: 'POST',
        body: JSON.stringify({
          action: rule.action,
          expression: rule.expression,
          description: rule.description,
          enabled: rule.enabled
        })
      });

      console.log(`[CloudflareAPI] Rule added successfully. New ruleset version:`, response.result);
      targetRuleset = response.result;
    }

    if (!targetRuleset) {
      throw new Error('Failed to create or get target ruleset');
    }

    return targetRuleset;
  }

  async updateRuleInZone(zoneId: string, ruleId: string, updatedRule: Partial<CloudflareRule>): Promise<CloudflareRuleset> {
    const allRulesets = await this.getZoneRulesets(zoneId);
    const rulesets = allRulesets.filter(ruleset => ruleset.phase === 'http_request_firewall_custom');
    
    for (const ruleset of rulesets) {
      const ruleIndex = ruleset.rules.findIndex(rule => rule.id === ruleId);
      if (ruleIndex !== -1) {
        const updatedRules = [...ruleset.rules];
        updatedRules[ruleIndex] = { ...updatedRules[ruleIndex], ...updatedRule };
        
        return await this.updateZoneRuleset(zoneId, ruleset.id, {
          ...ruleset,
          rules: updatedRules
        });
      }
    }
    
    throw new Error(`La regla con ID ${ruleId} no se encontró en la zona ${zoneId}`);
  }

  async removeRuleFromZone(zoneId: string, ruleId: string): Promise<CloudflareRuleset> {
    console.log(`[CloudflareAPI] *** ATTEMPTING TO REMOVE RULE ***`);
    console.log(`[CloudflareAPI] Target Rule ID: ${ruleId}`);
    console.log(`[CloudflareAPI] Zone ID: ${zoneId}`);

    // Get basic ruleset metadata (without rules)
    const allRulesets = await this.getZoneRulesets(zoneId);
    const customRulesets = allRulesets.filter(ruleset => ruleset.phase === 'http_request_firewall_custom');

    console.log(`[CloudflareAPI] Found ${customRulesets.length} custom rulesets to search for rule ${ruleId}`);

    // First, let's gather ALL rule IDs across all rulesets for comparison
    const allCurrentRuleIds: string[] = [];

    for (const basicRuleset of customRulesets) {
      console.log(`[CloudflareAPI] === Searching in ruleset ${basicRuleset.id} (${basicRuleset.name}) ===`);

      try {
        // Get full ruleset details including rules
        const detailedRuleset = await this.getZoneRuleset(zoneId, basicRuleset.id);

        if (!detailedRuleset.rules || !Array.isArray(detailedRuleset.rules)) {
          console.warn(`[CloudflareAPI] Ruleset ${basicRuleset.id} has no rules array, skipping...`);
          continue;
        }

        console.log(`[CloudflareAPI] Ruleset ${basicRuleset.id} has ${detailedRuleset.rules.length} rules`);

        // Collect all rule IDs from this ruleset
        const ruleIdsInThisRuleset = detailedRuleset.rules.map(rule => rule.id);
        allCurrentRuleIds.push(...ruleIdsInThisRuleset);

        console.log(`[CloudflareAPI] Rule IDs in ruleset ${basicRuleset.id}:`);
        ruleIdsInThisRuleset.forEach((id, index) => {
          const isTargetRule = id === ruleId;
          console.log(`[CloudflareAPI]   [${index}] ${id} ${isTargetRule ? '← TARGET RULE!' : ''}`);
        });

        const ruleIndex = detailedRuleset.rules.findIndex(rule => rule.id === ruleId);
        if (ruleIndex !== -1) {
          console.log(`[CloudflareAPI] ✅ FOUND TARGET RULE ${ruleId} at index ${ruleIndex} in ruleset ${basicRuleset.id}`);

          const targetRule = detailedRuleset.rules[ruleIndex];
          console.log(`[CloudflareAPI] Target rule details:`, {
            id: targetRule.id,
            description: targetRule.description,
            action: targetRule.action,
            enabled: targetRule.enabled
          });

          const updatedRules = detailedRuleset.rules.filter(rule => rule.id !== ruleId);

          console.log(`[CloudflareAPI] Updating ruleset: ${detailedRuleset.rules.length} → ${updatedRules.length} rules`);

          // Remove read-only fields that Cloudflare doesn't allow in updates
          const { last_updated, version, ...updatePayload } = detailedRuleset;

          const result = await this.updateZoneRuleset(zoneId, basicRuleset.id, {
            ...updatePayload,
            rules: updatedRules
          });

          console.log(`[CloudflareAPI] ✅ Successfully removed rule ${ruleId} from zone ${zoneId}`);
          return result;
        }
      } catch (error) {
        console.warn(`[CloudflareAPI] ⚠️ Error accessing ruleset ${basicRuleset.id}: ${error}`);
        continue;
      }
    }

    // If we get here, the rule was not found - let's provide detailed debugging info
    console.error(`[CloudflareAPI] ❌ RULE NOT FOUND - DEBUGGING INFO:`);
    console.error(`[CloudflareAPI] Target Rule ID: ${ruleId}`);
    console.error(`[CloudflareAPI] Zone ID: ${zoneId}`);
    console.error(`[CloudflareAPI] Searched ${customRulesets.length} custom rulesets`);
    console.error(`[CloudflareAPI] Total rules found across all rulesets: ${allCurrentRuleIds.length}`);
    console.error(`[CloudflareAPI] All current rule IDs in zone:`, allCurrentRuleIds);

    // Check if the target rule ID has any partial matches
    const similarIds = allCurrentRuleIds.filter(id =>
      id.includes(ruleId.slice(0, 8)) || ruleId.includes(id.slice(0, 8))
    );
    if (similarIds.length > 0) {
      console.error(`[CloudflareAPI] Similar IDs found (possible ID mismatch):`, similarIds);
    }

    throw new Error(`La regla con ID ${ruleId} no se encontró en la zona ${zoneId}. Se revisaron ${customRulesets.length} rulesets con ${allCurrentRuleIds.length} reglas totales.`);
  }

  // Optimized method to get only rule metadata (IDs, names, basic info)
  async getZoneSecurityRulesSummary(zoneId: string): Promise<Array<{
    id: string;
    rulesetId: string;
    rulesetName: string;
    description?: string;
    enabled?: boolean;
    action?: string;
  }>> {
    console.log(`[CloudflareAPI] Getting security rules summary for zone: ${zoneId}`);

    // Get rulesets metadata only
    const allRulesets = await this.getZoneRulesets(zoneId);
    const rulesets = allRulesets.filter(ruleset =>
      ruleset.phase === 'http_request_firewall_custom'
    );

    console.log(`[CloudflareAPI] Found ${rulesets.length} custom firewall rulesets out of ${allRulesets.length} total rulesets for zone ${zoneId}`);

    if (rulesets.length === 0) {
      console.log(`[CloudflareAPI] No custom firewall rulesets found for zone ${zoneId}`);
      return [];
    }

    const ruleSummaries: Array<{
      id: string;
      rulesetId: string;
      rulesetName: string;
      description?: string;
      enabled?: boolean;
      action?: string;
    }> = [];

    // Get basic ruleset info (which includes rule IDs but not full rule content)
    for (const ruleset of rulesets) {
      const knownSystemRulesets = [
        'Cloudflare Managed Free Ruleset',
        'Cloudflare Normalization Ruleset',
        'zone',
        'DDoS L7 ruleset'
      ];

      if (knownSystemRulesets.some(name => ruleset.name.includes(name))) {
        console.log(`[CloudflareAPI] Skipping known system ruleset: ${ruleset.name} (${ruleset.id})`);
        continue;
      }

      try {
        // Get basic ruleset info - this includes rule IDs and basic metadata
        const rulesetResponse = await this.makeRequest<CloudflareRuleset>(`/zones/${zoneId}/rulesets/${ruleset.id}`);
        const basicRuleset = rulesetResponse.result;

        if (basicRuleset.rules) {
          for (const rule of basicRuleset.rules) {
            ruleSummaries.push({
              id: rule.id!,
              rulesetId: ruleset.id,
              rulesetName: ruleset.name,
              description: rule.description,
              enabled: rule.enabled,
              action: rule.action
            });
          }
        }

        console.log(`[CloudflareAPI] Got summary for ${basicRuleset.rules?.length || 0} rules in ruleset: ${ruleset.name}`);
      } catch (error) {
        if (error instanceof Error && error.message.includes('403')) {
          console.warn(`[CloudflareAPI] ⚠️ No permissions to access custom ruleset ${ruleset.id} (${ruleset.name})`);
        } else {
          console.error(`[CloudflareAPI] Error getting summary for ruleset ${ruleset.id}:`, error);
        }
      }
    }

    console.log(`[CloudflareAPI] Zone ${zoneId}: Got summary for ${ruleSummaries.length} total rules`);
    return ruleSummaries;
  }

  // Helper method to get all security rules for a zone (LEGACY - use getZoneSecurityRulesSummary for better performance)
  async getZoneSecurityRules(zoneId: string): Promise<Array<CloudflareRule & { rulesetId: string; rulesetName: string }>> {
    console.log(`[CloudflareAPI] Getting security rules for zone: ${zoneId}`);

    // Get all rulesets first, then filter properly
    const allRulesets = await this.getZoneRulesets(zoneId);

    // Filter only for custom firewall rulesets (client-side filtering for accuracy)
    const rulesets = allRulesets.filter(ruleset =>
      ruleset.phase === 'http_request_firewall_custom'
    );

    console.log(`[CloudflareAPI] Found ${rulesets.length} custom firewall rulesets out of ${allRulesets.length} total rulesets for zone ${zoneId}`);

    // Early return if no custom firewall rulesets
    if (rulesets.length === 0) {
      console.log(`[CloudflareAPI] No custom firewall rulesets found for zone ${zoneId}`);
      return [];
    }

    const securityRules: Array<CloudflareRule & { rulesetId: string; rulesetName: string }> = [];
    let permissionIssues = 0;
    let processedRulesets = 0;

    // Process rulesets in parallel for better performance
    const rulesetPromises = rulesets.map(async (ruleset) => {
      // Skip known problematic rulesets early to avoid 403 errors
      const knownSystemRulesets = [
        'Cloudflare Managed Free Ruleset',
        'Cloudflare Normalization Ruleset',
        'zone', // Generic zone rulesets often have permission issues
        'DDoS L7 ruleset'
      ];

      if (knownSystemRulesets.some(name => ruleset.name.includes(name))) {
        console.log(`[CloudflareAPI] Skipping known system ruleset: ${ruleset.name} (${ruleset.id})`);
        return { success: false, rules: [] };
      }

      console.log(`[CloudflareAPI] Processing custom ruleset: ${ruleset.name} (${ruleset.id})`);
      try {
        const detailedRuleset = await this.getZoneRuleset(zoneId, ruleset.id);
        const rulesCount = detailedRuleset.rules?.length || 0;
        console.log(`[CloudflareAPI] Found ${rulesCount} rules in custom ruleset: ${ruleset.name}`);

        const rulesWithMetadata = (detailedRuleset.rules || []).map(rule => ({
          ...rule,
          rulesetId: ruleset.id,
          rulesetName: ruleset.name
        }));

        processedRulesets++;
        return { success: true, rules: rulesWithMetadata };
      } catch (error) {
        if (error instanceof Error && error.message.includes('403')) {
          console.warn(`[CloudflareAPI] ⚠️ No permissions to access custom ruleset ${ruleset.id} (${ruleset.name}). This may be expected for certain rulesets.`);
          permissionIssues++;
        } else {
          console.error(`[CloudflareAPI] Error getting detailed ruleset ${ruleset.id}:`, error);
        }
        return { success: false, rules: [] };
      }
    });

    // Wait for all ruleset processing to complete
    const rulesetResults = await Promise.allSettled(rulesetPromises);

    // Collect all successful results
    for (const result of rulesetResults) {
      if (result.status === 'fulfilled' && result.value.success) {
        securityRules.push(...result.value.rules);
      }
    }

    if (permissionIssues > 0) {
      console.warn(`[CloudflareAPI] 🔐 Token permission issue: Could not access ${permissionIssues}/${rulesets.length} rulesets due to insufficient permissions. Please ensure your Cloudflare API token has 'Zone WAF: Edit' permission.`);
    }

    console.log(`[CloudflareAPI] Zone ${zoneId}: Found ${securityRules.length} total rules from ${processedRulesets}/${rulesets.length} accessible rulesets`);
    return securityRules;
  }

  // Enhanced rule application with template management
  async applyTemplateRule(zoneId: string, template: RuleTemplate): Promise<{ 
    success: boolean; 
    appliedRuleId?: string; 
    removedRuleId?: string; 
    action: 'added' | 'updated' | 'skipped';
    message: string;
  }> {
    try {
      const existingRules = await this.getZoneSecurityRules(zoneId);
      
      // Check for existing template rules with same friendlyId
      const existingTemplateRule = existingRules.find(rule => {
        const parsed = parseCloudflareRuleName(rule.description || '');
        return parsed && parsed.friendlyId === template.friendlyId;
      });

      const cloudflareRuleName = createCloudflareRuleName(template.name, template.friendlyId, template.version);

      if (existingTemplateRule) {
        const parsed = parseCloudflareRuleName(existingTemplateRule.description || '');
        if (parsed) {
          const versionComparison = compareVersions(template.version, parsed.version);
          
          if (versionComparison > 0) {
            // New version is newer - update
            await this.removeRuleFromZone(zoneId, existingTemplateRule.id);
            
            const newRule = {
              id: template.id,
              expression: template.expression,
              action: mapTemplateActionToCloudflareAction(template.action),
              action_parameters: template.actionParameters,
              description: cloudflareRuleName,
              enabled: template.enabled
            };
            
            const updatedRuleset = await this.addRuleToZone(zoneId, newRule);
            const addedRule = updatedRuleset.rules.find(r => r.description === cloudflareRuleName);

            // Update rule mapping
            if (addedRule) {
              // Remove old mapping
              await removeRuleMapping(existingTemplateRule.id);

              // Add new mapping
              await addRuleMapping({
                cloudflareRuleId: addedRule.id,
                templateId: template.id,
                friendlyId: template.friendlyId,
                version: template.version,
                appliedAt: new Date().toISOString(),
                zoneId,
                domainName: '' // Will be filled by caller if needed
              });

              console.log(`[CloudflareAPI] Updated rule mapping: ${addedRule.id} → ${template.friendlyId} v${template.version}`);
            }

            return {
              success: true,
              appliedRuleId: addedRule?.id,
              removedRuleId: existingTemplateRule.id,
              action: 'updated',
              message: `Updated rule from v${parsed.version} to v${template.version}`
            };
          } else if (versionComparison === 0) {
            // Same version - skip
            return {
              success: true,
              action: 'skipped',
              message: `Rule ${template.friendlyId} v${template.version} already exists`
            };
          } else {
            // Existing version is newer - skip with warning
            return {
              success: true,
              action: 'skipped',
              message: `Existing rule v${parsed.version} is newer than template v${template.version}`
            };
          }
        }
      }

      // No existing rule or couldn't parse - add new
      const newRule = {
        expression: template.expression,
        action: mapTemplateActionToCloudflareAction(template.action),
        action_parameters: template.actionParameters,
        description: cloudflareRuleName,
        enabled: template.enabled
      };

      console.log(`[CloudflareAPI] Adding new rule for template ${template.friendlyId}:`, newRule);
      const updatedRuleset = await this.addRuleToZone(zoneId, newRule);
      console.log(`[CloudflareAPI] Updated ruleset:`, updatedRuleset);

      const addedRule = updatedRuleset.rules.find(r => r.description === cloudflareRuleName);
      console.log(`[CloudflareAPI] Found added rule:`, addedRule);

      // Add rule mapping for new rule
      if (addedRule) {
        await addRuleMapping({
          cloudflareRuleId: addedRule.id,
          templateId: template.id,
          friendlyId: template.friendlyId,
          version: template.version,
          appliedAt: new Date().toISOString(),
          zoneId,
          domainName: '' // Will be filled by caller if needed
        });

        console.log(`[CloudflareAPI] Added rule mapping: ${addedRule.id} → ${template.friendlyId} v${template.version}`);
      }

      return {
        success: true,
        appliedRuleId: addedRule?.id,
        action: 'added',
        message: `Added new rule ${template.friendlyId} v${template.version}`
      };

    } catch (error) {
      return {
        success: false,
        action: 'skipped',
        message: `No se pudo aplicar la regla: ${error instanceof Error ? error.message : 'Error desconocido'}`
      };
    }
  }

  // Remove template rule by friendlyId
  async removeTemplateRule(zoneId: string, friendlyId: string): Promise<{
    success: boolean;
    removedRuleId?: string;
    message: string;
  }> {
    try {
      const existingRules = await this.getZoneSecurityRules(zoneId);
      
      const templateRule = existingRules.find(rule => {
        const parsed = parseCloudflareRuleName(rule.description || '');
        return parsed && parsed.friendlyId === friendlyId;
      });

      if (!templateRule) {
        return {
          success: true,
          message: `Rule ${friendlyId} not found in zone`
        };
      }

      await this.removeRuleFromZone(zoneId, templateRule.id);

      return {
        success: true,
        removedRuleId: templateRule.id,
        message: `Removed rule ${friendlyId}`
      };

    } catch (error) {
      return {
        success: false,
        message: `No se pudo eliminar la regla: ${error instanceof Error ? error.message : 'Error desconocido'}`
      };
    }
  }

  // Remove all template rules
  async removeAllTemplateRules(zoneId: string): Promise<{
    success: boolean;
    removedCount: number;
    message: string;
  }> {
    try {
      const existingRules = await this.getZoneSecurityRules(zoneId);
      
      const templateRules = existingRules.filter(rule => 
        isTemplateRule(rule.description || '')
      );

      let removedCount = 0;
      for (const rule of templateRules) {
        try {
          await this.removeRuleFromZone(zoneId, rule.id);
          removedCount++;
        } catch (error) {
          console.warn(`Failed to remove rule ${rule.id}:`, error);
        }
      }

      return {
        success: true,
        removedCount,
        message: `Removed ${removedCount} template rules`
      };

    } catch (error) {
      return {
        success: false,
        removedCount: 0,
        message: `No se pudieron eliminar las reglas de plantilla: ${error instanceof Error ? error.message : 'Error desconocido'}`
      };
    }
  }

  // Remove all rules (template + custom)
  async removeAllRules(zoneId: string): Promise<{
    success: boolean;
    removedCount: number;
    message: string;
  }> {
    try {
      const existingRules = await this.getZoneSecurityRules(zoneId);

      if (existingRules.length === 0) {
        return {
          success: true,
          removedCount: 0,
          message: 'No hay reglas para eliminar'
        };
      }

      let removedCount = 0;
      let failedCount = 0;

      for (const rule of existingRules) {
        try {
          await this.removeRuleFromZone(zoneId, rule.id);
          removedCount++;
          console.log(`[CloudflareAPI] Successfully removed rule ${rule.id}`);
        } catch (error) {
          failedCount++;
          console.warn(`[CloudflareAPI] Failed to remove rule ${rule.id}:`, error);
        }
      }

      const message = failedCount > 0
        ? `Removed ${removedCount} rules, ${failedCount} failed`
        : `Removed ${removedCount} rules (template + custom)`;

      return {
        success: true,
        removedCount,
        message
      };

    } catch (error) {
      console.error(`[CloudflareAPI] Error in removeAllRules for zone ${zoneId}:`, error);
      return {
        success: false,
        removedCount: 0,
        message: `No se pudieron eliminar todas las reglas: ${error instanceof Error ? error.message : 'Error desconocido'}`
      };
    }
  }

  // Remove only custom rules (non-template rules) from a zone
  async removeCustomRules(zoneId: string): Promise<{
    success: boolean;
    removedCount: number;
    message: string;
  }> {
    try {
      console.log(`[CloudflareAPI] Starting removal of custom rules for zone ${zoneId}`);

      // Get categorized rules to identify custom rules
      const { customRules } = await this.getCategorizedZoneRules(zoneId);

      if (customRules.length === 0) {
        return {
          success: true,
          removedCount: 0,
          message: 'No hay reglas custom para eliminar'
        };
      }

      console.log(`[CloudflareAPI] Found ${customRules.length} custom rules to remove`);

      let removedCount = 0;
      const errors: string[] = [];

      // Remove each custom rule individually
      for (const rule of customRules) {
        try {
          console.log(`[CloudflareAPI] Removing custom rule ${rule.id}: ${rule.description}`);
          await this.removeRuleFromZone(zoneId, rule.id);
          removedCount++;
          console.log(`[CloudflareAPI] ✅ Successfully removed custom rule ${rule.id}`);
        } catch (error) {
          console.error(`[CloudflareAPI] ❌ Failed to remove custom rule ${rule.id}:`, error);
          errors.push(`Rule ${rule.id}: ${error instanceof Error ? error.message : 'Error desconocido'}`);
        }
      }

      const hasErrors = errors.length > 0;
      const message = hasErrors
        ? `Se eliminaron ${removedCount}/${customRules.length} reglas custom. Errores: ${errors.join(', ')}`
        : `Se eliminaron ${removedCount} reglas custom correctamente`;

      return {
        success: !hasErrors || removedCount > 0, // Success if no errors or at least some rules were removed
        removedCount,
        message
      };

    } catch (error) {
      console.error(`[CloudflareAPI] Error in removeCustomRules for zone ${zoneId}:`, error);
      return {
        success: false,
        removedCount: 0,
        message: `No se pudieron eliminar las reglas custom: ${error instanceof Error ? error.message : 'Error desconocido'}`
      };
    }
  }

  // Get categorized rules for a zone
  async getCategorizedZoneRules(zoneId: string): Promise<{
    templateRules: Array<CloudflareRule & { rulesetId: string; friendlyId: string; version: string; originalName: string }>;
    customRules: Array<CloudflareRule & { rulesetId: string }>;
  }> {
    console.log(`[CloudflareAPI] *** GETTING CATEGORIZED RULES FOR MODAL ***`);
    console.log(`[CloudflareAPI] Zone ID: ${zoneId}`);

    const allRules = await this.getZoneSecurityRules(zoneId);
    console.log(`[CloudflareAPI] Found ${allRules.length} total rules for modal display`);

    // Log all rule IDs that will be shown in the modal
    const allRuleIds = allRules.map(rule => rule.id);
    console.log(`[CloudflareAPI] Rule IDs that will be shown in modal:`, allRuleIds);

    const templateRules: Array<CloudflareRule & { rulesetId: string; friendlyId: string; version: string; originalName: string }> = [];
    const customRules: Array<CloudflareRule & { rulesetId: string }> = [];

    for (const rule of allRules) {
      console.log(`[CloudflareAPI] Processing rule ${rule.id} - Description: "${rule.description}"`);

      const parsed = parseCloudflareRuleName(rule.description || '');

      if (parsed) {
        console.log(`[CloudflareAPI] → Template rule: ${parsed.friendlyId} v${parsed.version}`);
        templateRules.push({
          ...rule,
          friendlyId: parsed.friendlyId,
          version: parsed.version,
          originalName: parsed.originalName
        });
      } else {
        console.log(`[CloudflareAPI] → Custom rule: ${rule.id}`);
        customRules.push(rule);
      }
    }

    console.log(`[CloudflareAPI] Categorized: ${templateRules.length} template rules, ${customRules.length} custom rules`);
    console.log(`[CloudflareAPI] Template rule IDs:`, templateRules.map(r => r.id));
    console.log(`[CloudflareAPI] Custom rule IDs:`, customRules.map(r => r.id));

    return { templateRules, customRules };
  }

  /**
   * Auto-detect and import templates from existing rules
   * This is called during unified domain processing to automatically create templates
   */
  async autoImportTemplates(rules: CloudflareRule[], existingTemplates: RuleTemplate[]): Promise<{
    importedTemplates: RuleTemplate[];
    updatedTemplates: RuleTemplate[];
    skippedRules: string[];
  }> {
    console.log(`[CloudflareAPI] Starting auto-import of templates from ${rules.length} rules`);

    const importedTemplates: RuleTemplate[] = [];
    const updatedTemplates: RuleTemplate[] = [];
    const skippedRules: string[] = [];

    for (const rule of rules) {
      try {
        // Skip if already a template rule
        if (isTemplateRule(rule.description || '')) {
          console.log(`[CloudflareAPI] Skipping template rule: ${rule.description}`);
          skippedRules.push(rule.description || 'No description');
          continue;
        }

        // Check if rule follows template format OR is a common security rule
        const isTemplateFormatRule = isTemplateFormat(rule.description || '');
        const isCommonSecurityRule = (rule.description || '').toLowerCase().includes('waf') ||
                                    (rule.description || '').toLowerCase().includes('security') ||
                                    (rule.description || '').toLowerCase().includes('protection') ||
                                    /\b(block|challenge|allow|log)\b.*\b(bot|spam|attack|threat|malware)\b/i.test(rule.description || '') ||
                                    /\b(cf\.client\.bot|http\.user_agent|ip\.geoip\.country)\b/i.test(rule.expression || '');

        if (isTemplateFormatRule || isCommonSecurityRule) {
          let parsedTemplate;

          if (isTemplateFormatRule) {
            parsedTemplate = parseTemplateFormat(rule.description || '');
          } else {
            // Create a synthetic template for common security rules
            const description = rule.description || 'Security Rule';
            const friendlyId = generateNextFriendlyId(existingTemplates);
            const name = description.length > 50 ? `${description.substring(0, 47)}...` : description;

            parsedTemplate = {
              friendlyId,
              name,
              version: '1.0'
            };

            console.log(`[CloudflareAPI] Created synthetic template for common security rule: ${parsedTemplate.friendlyId} - ${parsedTemplate.name}`);
          }

          if (parsedTemplate) {
            console.log(`[CloudflareAPI] Processing rule as template: ${parsedTemplate.friendlyId} - ${parsedTemplate.name} #v${parsedTemplate.version}`);

            // Check if template already exists
            const existingTemplate = findTemplateByFriendlyId(existingTemplates, parsedTemplate.friendlyId);

            if (existingTemplate) {
              // Compare versions
              const versionComparison = compareVersions(parsedTemplate.version, existingTemplate.version);

              if (versionComparison > 0) {
                // New version is newer - update existing template
                console.log(`[CloudflareAPI] Updating existing template ${parsedTemplate.friendlyId} from v${existingTemplate.version} to v${parsedTemplate.version}`);

                const updatedTemplate: RuleTemplate = {
                  ...existingTemplate,
                  name: parsedTemplate.name,
                  version: parsedTemplate.version,
                  expression: rule.expression || existingTemplate.expression,
                  action: (rule.action as RuleTemplate['action']) || existingTemplate.action,
                  actionParameters: rule.action_parameters || existingTemplate.actionParameters,
                  updatedAt: new Date().toISOString()
                };

                updatedTemplates.push(updatedTemplate);
              } else {
                console.log(`[CloudflareAPI] Template ${parsedTemplate.friendlyId} already exists with same or newer version`);
                skippedRules.push(rule.description || 'No description');
              }
            } else {
              // Create new template
              console.log(`[CloudflareAPI] Creating new template: ${parsedTemplate.friendlyId}`);

              const newTemplate = createTemplateFromRule(rule, parsedTemplate, existingTemplates);
              importedTemplates.push(newTemplate);
            }
          } else {
            console.log(`[CloudflareAPI] Failed to parse template format: ${rule.description}`);
            skippedRules.push(rule.description || 'No description');
          }
        } else {
          // Not a template format rule or common security rule
          console.log(`[CloudflareAPI] Skipping non-template rule: ${rule.description}`);
          skippedRules.push(rule.description || 'No description');
        }
      } catch (error) {
        console.error(`[CloudflareAPI] Error processing rule ${rule.id}:`, error);
        skippedRules.push(rule.description || 'Error processing rule');
      }
    }

    console.log(`[CloudflareAPI] Auto-import completed: ${importedTemplates.length} imported, ${updatedTemplates.length} updated, ${skippedRules.length} skipped`);

    return {
      importedTemplates,
      updatedTemplates,
      skippedRules
    };
  }

  /**
   * Process domains with auto template import
   * This is the enhanced version that automatically detects and imports templates
   */
  async processDomainsWithAutoImport(zoneIds: string[], existingTemplates: RuleTemplate[]): Promise<{
    domains: DomainStatus[];
    templateChanges: {
      imported: RuleTemplate[];
      updated: RuleTemplate[];
      totalRulesProcessed: number;
    };
  }> {
    console.log(`[CloudflareAPI] Processing ${zoneIds.length} zones with auto template import`);

    const domains: DomainStatus[] = [];
    const allRules: CloudflareRule[] = [];
    const BATCH_SIZE = 5;

    // Process zones in batches to get all rules
    for (let i = 0; i < zoneIds.length; i += BATCH_SIZE) {
      const batch = zoneIds.slice(i, i + BATCH_SIZE);

      const batchPromises = batch.map(async (zoneId) => {
        try {
          const rules = await this.getZoneSecurityRules(zoneId);
          return { zoneId, rules, success: true };
        } catch (error) {
          console.warn(`[CloudflareAPI] Failed to get rules for zone ${zoneId}:`, error);
          return { zoneId, rules: [], success: false };
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);

      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value.success) {
          allRules.push(...result.value.rules);
        }
      }

      // Rate limiting delay
      if (i + BATCH_SIZE < zoneIds.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    console.log(`[CloudflareAPI] Collected ${allRules.length} total rules from ${zoneIds.length} zones`);

    // Auto-import templates from collected rules
    const templateImportResult = await this.autoImportTemplates(allRules, existingTemplates);

    console.log(`[CloudflareAPI] Template auto-import result:`, {
      imported: templateImportResult.importedTemplates.length,
      updated: templateImportResult.updatedTemplates.length,
      skipped: templateImportResult.skippedRules.length
    });

    // Now process domains normally
    const domainResults = await this.getDomainStatuses(undefined, undefined, undefined, (completed, total) => {
      console.log(`[CloudflareAPI] Domain processing: ${completed}/${total} completed`);
    });

    return {
      domains: domainResults.domains,
      templateChanges: {
        imported: templateImportResult.importedTemplates,
        updated: templateImportResult.updatedTemplates,
        totalRulesProcessed: allRules.length
      }
    };
  }
}
