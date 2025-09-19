import { RuleTemplate } from '@/types/cloudflare';

interface DomainRuleInfo {
  zoneId: string;
  domainName: string;
  templateRules: Array<{
    friendlyId: string;
    version: string;
    isOutdated: boolean;
    templateId: string;
  }>;
}

interface DomainsCache {
  domains: Array<{
    zoneId: string;
    name: string;
    securityRules?: {
      templateRules: Array<{
        friendlyId: string;
        version: string;
        isOutdated: boolean;
        templateId: string;
      }>;
    };
  }>;
  lastUpdated: string;
}

export interface AffectedDomain {
  zoneId: string;
  domainName: string;
  currentVersion: string;
  templateId: string;
}

/**
 * Encuentra todos los dominios que tienen una regla específica aplicada
 * Uses ONLY local domain store data - NO API fallback to avoid unnecessary scans
 */
export async function findDomainsWithRule(friendlyId: string, domainsFromStore: any[]): Promise<AffectedDomain[]> {
  try {
    if (!domainsFromStore || domainsFromStore.length === 0) {
      console.warn(`[findDomainsWithRule] No domain data provided for rule ${friendlyId}`);
      return [];
    }

    const domainsData = domainsFromStore;

    const affectedDomains: AffectedDomain[] = [];

    for (const domain of domainsData) {
      if (domain.securityRules?.templateRules) {
        const matchingRule = domain.securityRules.templateRules.find(
          (rule: any) => rule.friendlyId === friendlyId
        );

        if (matchingRule) {
          affectedDomains.push({
            zoneId: domain.zoneId,
            domainName: domain.name || domain.domain,
            currentVersion: matchingRule.version,
            templateId: matchingRule.templateId
          });
        }
      }
    }

    return affectedDomains;
  } catch (error) {
    console.error('Error finding domains with rule:', error);
    return [];
  }
}

/**
 * Encuentra dominios con versiones desactualizadas de una regla específica
 */
export async function findOutdatedDomains(template: RuleTemplate, domainsFromStore: any[]): Promise<AffectedDomain[]> {
  try {
    const allDomains = await findDomainsWithRule(template.friendlyId, domainsFromStore);

    // Filter only domains with outdated versions
    const outdatedDomains = allDomains.filter(domain => {
      return compareVersions(domain.currentVersion, template.version) < 0;
    });

    return outdatedDomains;
  } catch (error) {
    console.error('Error finding outdated domains:', error);
    return [];
  }
}

/**
 * Compara dos versiones semánticas
 * @param version1 Primera versión
 * @param version2 Segunda versión
 * @returns -1 si version1 < version2, 0 si iguales, 1 si version1 > version2
 */
export function compareVersions(version1: string, version2: string): number {
  const v1Parts = version1.split('.').map(Number);
  const v2Parts = version2.split('.').map(Number);

  const maxLength = Math.max(v1Parts.length, v2Parts.length);

  for (let i = 0; i < maxLength; i++) {
    const v1Part = v1Parts[i] || 0;
    const v2Part = v2Parts[i] || 0;

    if (v1Part < v2Part) return -1;
    if (v1Part > v2Part) return 1;
  }

  return 0;
}

/**
 * Actualiza reglas en dominios específicos
 */
export async function updateRuleInDomains(
  template: RuleTemplate,
  zoneIds: string[],
  apiToken: string,
  onProgress?: (completed: number, total: number) => void
): Promise<{ successful: number; failed: string[] }> {
  let successful = 0;
  const failed: string[] = [];

  for (let i = 0; i < zoneIds.length; i++) {
    const zoneId = zoneIds[i];

    try {
      // Call the bulk action API to update this specific domain
      const response = await fetch('/api/domains/rules/bulk-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-token': apiToken
        },
        body: JSON.stringify({
          action: 'add', // This will replace existing rule with same friendlyId
          selectedRules: [template.friendlyId],
          targetZoneIds: [zoneId],
          preview: false
        })
      });

      if (response.ok) {
        successful++;
      } else {
        failed.push(zoneId);
      }
    } catch (error) {
      console.error(`Error updating rule in zone ${zoneId}:`, error);
      failed.push(zoneId);
    }

    // Report progress
    if (onProgress) {
      onProgress(i + 1, zoneIds.length);
    }
  }

  return { successful, failed };
}

/**
 * Verifica si una regla está siendo usada por algún dominio
 */
export async function isRuleInUse(friendlyId: string, domainsFromStore: any[]): Promise<{
  inUse: boolean;
  domainCount: number;
  domains: string[]
}> {
  try {
    if (!domainsFromStore || domainsFromStore.length === 0) {
      return { inUse: false, domainCount: 0, domains: [] };
    }

    const affectedDomains = await findDomainsWithRule(friendlyId, domainsFromStore);

    return {
      inUse: affectedDomains.length > 0,
      domainCount: affectedDomains.length,
      domains: affectedDomains.map(d => d.domainName)
    };
  } catch (error) {
    console.error('Error checking if rule is in use:', error);
    return { inUse: false, domainCount: 0, domains: [] };
  }
}

/**
 * Obtiene estadísticas de uso para todas las reglas
 */
export async function getRuleUsageStats(domainsFromStore: any[]): Promise<Map<string, {
  domainCount: number;
  domains: string[]
}>> {
  const stats = new Map();

  if (!domainsFromStore || domainsFromStore.length === 0) {
    return stats;
  }

  // Extract all unique friendlyIds from domains
  const friendlyIds = new Set<string>();

  for (const domain of domainsFromStore) {
    if (domain.securityRules?.templateRules) {
      for (const rule of domain.securityRules.templateRules) {
        if (rule.friendlyId) {
          friendlyIds.add(rule.friendlyId);
        }
      }
    }
  }

  // Get stats for each rule
  for (const friendlyId of friendlyIds) {
    const usage = await isRuleInUse(friendlyId, domainsFromStore);
    stats.set(friendlyId, {
      domainCount: usage.domainCount,
      domains: usage.domains
    });
  }

  return stats;
}

/**
 * Marca dominios como desactualizados en el cache sin actualizar las reglas
 */
export async function markDomainsAsOutdated(
  friendlyId: string,
  newVersion: string
): Promise<void> {
  try {
    // This will be handled by the domain cache invalidation that already exists
    // The analyze endpoint will detect the version mismatch and mark rules as outdated
    console.log(`Domains with rule ${friendlyId} will be marked as outdated on next refresh`);
  } catch (error) {
    console.error('Error marking domains as outdated:', error);
  }
}