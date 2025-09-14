import { CloudflareZone, CloudflareDNSRecord, CloudflareApiResponse, DomainStatus, CloudflareRuleset, CloudflareRule, RuleTemplate } from '@/types/cloudflare';
import { createCloudflareRuleName, parseCloudflareRuleName, isTemplateRule, compareVersions } from './ruleUtils';

const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';

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
        console.error(`Error en la API de Cloudflare (${response.status}):`, errorText);
        throw new Error(`Error en la API de Cloudflare: ${response.status} - ${errorText}`);
      } else {
        return response; // Return the failed response for manual handling
      }
    }

    return response.json();
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

    try {
      const botFightResponse = await this.makeRequest<{ value: string }>(`/zones/${zoneId}/settings/bot_fight_mode`, {}, false);
      if (botFightResponse.ok) {
        const result = await botFightResponse.json();
        botFightMode = result.result.value === 'on';
      } else {
        // This is an expected outcome for accounts without this feature.
        console.info(`Bot Fight Mode not available for zone ${zoneId}.`);
      }
    } catch (error) {
      console.error(`Error getting bot_fight_mode for zone ${zoneId}:`, error);
    }

    return {
      underAttackMode,
      botFightMode
    };
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
    const response = await this.makeRequest<CloudflareRuleset>(`/zones/${zoneId}/rulesets/${rulesetId}`);
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
    // First, get or create the appropriate ruleset for the zone
    const rulesets = await this.getZoneRulesets(zoneId);
    let targetRuleset = rulesets.find(rs => rs.phase === phase);

    if (!targetRuleset) {
      // Create a new ruleset for this phase
      targetRuleset = await this.createZoneRuleset(zoneId, {
        name: `Custom ${phase} rules`,
        kind: 'zone',
        phase: phase,
        rules: [rule as CloudflareRule]
      });
    } else {
      // Add rule to existing ruleset
      const updatedRules = [...targetRuleset.rules, rule as CloudflareRule];
      targetRuleset = await this.updateZoneRuleset(zoneId, targetRuleset.id, {
        ...targetRuleset,
        rules: updatedRules
      });
    }

    return targetRuleset;
  }

  async updateRuleInZone(zoneId: string, ruleId: string, updatedRule: Partial<CloudflareRule>): Promise<CloudflareRuleset> {
    const rulesets = await this.getZoneRulesets(zoneId);
    
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
    const rulesets = await this.getZoneRulesets(zoneId);
    
    for (const ruleset of rulesets) {
      const ruleIndex = ruleset.rules.findIndex(rule => rule.id === ruleId);
      if (ruleIndex !== -1) {
        const updatedRules = ruleset.rules.filter(rule => rule.id !== ruleId);
        
        return await this.updateZoneRuleset(zoneId, ruleset.id, {
          ...ruleset,
          rules: updatedRules
        });
      }
    }
    
    throw new Error(`La regla con ID ${ruleId} no se encontró en la zona ${zoneId}`);
  }

  // Helper method to get all security rules for a zone
  async getZoneSecurityRules(zoneId: string): Promise<Array<CloudflareRule & { rulesetId: string; rulesetName: string }>> {
    console.log(`Getting security rules for zone: ${zoneId}`);
    // Only get rulesets for the specific phase we care about
    const rulesets = await this.getZoneRulesets(zoneId, 'http_request_firewall_custom');
    console.log(`Found ${rulesets.length} custom firewall rulesets`);
    const securityRules: Array<CloudflareRule & { rulesetId: string; rulesetName: string }> = [];
    let permissionIssues = 0;

    for (const ruleset of rulesets) {
      console.log(`Processing ruleset: ${ruleset.name} (${ruleset.id})`);
      // Get the detailed ruleset with rules included
      try {
        const detailedRuleset = await this.getZoneRuleset(zoneId, ruleset.id);
        console.log(`Found ${detailedRuleset.rules?.length || 0} rules in ruleset: ${ruleset.name}`);
        for (const rule of detailedRuleset.rules || []) {
          securityRules.push({
            ...rule,
            rulesetId: ruleset.id,
            rulesetName: ruleset.name
          });
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('403')) {
          console.warn(`⚠️ No permissions to access ruleset ${ruleset.id} (${ruleset.name}). Token may need Zone WAF: Edit permission.`);
          permissionIssues++;
        } else {
          console.error(`Error getting detailed ruleset ${ruleset.id}:`, error);
        }
      }
    }

    if (permissionIssues > 0) {
      console.warn(`🔐 Token permission issue: Could not access ${permissionIssues} rulesets due to insufficient permissions. Please ensure your Cloudflare API token has 'Zone WAF: Edit' permission.`);
    }

    console.log(`Found ${securityRules.length} total rules (${permissionIssues} rulesets inaccessible due to permissions)`);
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
              action: template.action,
              action_parameters: template.actionParameters,
              description: cloudflareRuleName,
              enabled: template.enabled
            };
            
            const updatedRuleset = await this.addRuleToZone(zoneId, newRule);
            const addedRule = updatedRuleset.rules.find(r => r.description === cloudflareRuleName);
            
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
        action: template.action,
        action_parameters: template.actionParameters,
        description: cloudflareRuleName,
        enabled: template.enabled
      };

      console.log(`[CloudflareAPI] Adding new rule for template ${template.friendlyId}:`, newRule);
      const updatedRuleset = await this.addRuleToZone(zoneId, newRule);
      console.log(`[CloudflareAPI] Updated ruleset:`, updatedRuleset);

      const addedRule = updatedRuleset.rules.find(r => r.description === cloudflareRuleName);
      console.log(`[CloudflareAPI] Found added rule:`, addedRule);

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
      
      let removedCount = 0;
      for (const rule of existingRules) {
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
        message: `Removed ${removedCount} rules (template + custom)`
      };

    } catch (error) {
      return {
        success: false,
        removedCount: 0,
        message: `No se pudieron eliminar todas las reglas: ${error instanceof Error ? error.message : 'Error desconocido'}`
      };
    }
  }

  // Get categorized rules for a zone
  async getCategorizedZoneRules(zoneId: string): Promise<{
    templateRules: Array<CloudflareRule & { rulesetId: string; friendlyId: string; version: string; originalName: string }>;
    customRules: Array<CloudflareRule & { rulesetId: string }>;
  }> {
    console.log(`Getting categorized rules for zone: ${zoneId}`);
    const allRules = await this.getZoneSecurityRules(zoneId);
    console.log(`Found ${allRules.length} total rules`);
    
    const templateRules: Array<CloudflareRule & { rulesetId: string; friendlyId: string; version: string; originalName: string }> = [];
    const customRules: Array<CloudflareRule & { rulesetId: string }> = [];

    for (const rule of allRules) {
      const parsed = parseCloudflareRuleName(rule.description || '');
      
      if (parsed) {
        templateRules.push({
          ...rule,
          friendlyId: parsed.friendlyId,
          version: parsed.version,
          originalName: parsed.originalName
        });
      } else {
        customRules.push(rule);
      }
    }

    return { templateRules, customRules };
  }
}
