import { NextRequest, NextResponse } from 'next/server';
import { DomainStatus, DomainRuleStatus } from '@/types/cloudflare';
import { safeReadJsonFile, safeWriteJsonFile } from '@/lib/fileSystem';

const DOMAIN_CACHE_FILE = 'domains-cache.json';
const DOMAIN_RULES_CACHE_FILE = 'domain-rules-status.json';

interface DomainsCache {
  domains: DomainStatus[];
  lastUpdate: string;
  totalCount: number;
}

interface DomainRulesCache {
  domainStatuses: DomainRuleStatus[];
  lastUpdated: string;
}

async function loadDomainsCache(): Promise<DomainsCache | null> {
  try {
    return await safeReadJsonFile<DomainsCache>(DOMAIN_CACHE_FILE);
  } catch {
    return null;
  }
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

async function saveDomainsCache(cache: DomainsCache): Promise<void> {
  await safeWriteJsonFile(DOMAIN_CACHE_FILE, cache);
}

// POST - Enrich domains with security rules information
export async function POST(request: NextRequest) {
  console.log('[Enrich API] POST request received');
  try {
    console.log('[Enrich API] Loading domains cache...');
    const domainsCache = await loadDomainsCache();
    console.log('[Enrich API] Domains cache loaded:', domainsCache ? 'success' : 'null');
    if (!domainsCache) {
      return NextResponse.json({
        success: false,
        error: 'No domains cache found'
      }, { status: 404 });
    }

    const rulesCache = await loadDomainRulesCache();
    
    // Create a map for quick lookup
    const rulesMap = new Map(
      rulesCache.domainStatuses.map(status => [status.zoneId, status])
    );

    // Enrich domains with security rules information
    const enrichedDomains: DomainStatus[] = domainsCache.domains.map(domain => {
      const ruleStatus = rulesMap.get(domain.zoneId);
      
      if (ruleStatus) {
        return {
          ...domain,
          securityRules: {
            totalRules: ruleStatus.appliedRules.length + ruleStatus.customRules.length,
            corporateRules: ruleStatus.appliedRules.length,
            customRules: ruleStatus.customRules.length,
            hasConflicts: ruleStatus.appliedRules.some(rule => rule.status === 'conflict' || rule.status === 'outdated'),
            lastAnalyzed: ruleStatus.lastAnalyzed
          }
        };
      }
      
      return {
        ...domain
        // Don't add securityRules property if no rules data exists
        // This allows SecurityRulesIndicator to properly detect unanalyzed domains
      };
    });

    // Update the cache with enriched data
    const updatedCache: DomainsCache = {
      ...domainsCache,
      domains: enrichedDomains,
      lastUpdate: new Date().toISOString()
    };

    await saveDomainsCache(updatedCache);

    return NextResponse.json({
      success: true,
      data: {
        domains: enrichedDomains,
        totalCount: domainsCache.totalCount,
        lastUpdate: updatedCache.lastUpdate,
        enrichedWithSecurityData: true
      }
    });

  } catch (error) {
    console.error('Error enriching domains with security data:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to enrich domains with security data'
    }, { status: 500 });
  }
}

// GET - Get enriched domains from cache
export async function GET() {
  try {
    const domainsCache = await loadDomainsCache();
    if (!domainsCache) {
      return NextResponse.json({
        success: false,
        error: 'No domains cache found'
      }, { status: 404 });
    }

    // Check if domains are already enriched (have securityRules property)
    const hasSecurityData = domainsCache.domains.some(domain => 
      domain.securityRules !== undefined
    );

    return NextResponse.json({
      success: true,
      data: {
        domains: domainsCache.domains,
        totalCount: domainsCache.totalCount,
        lastUpdate: domainsCache.lastUpdate,
        hasSecurityData
      }
    });

  } catch (error) {
    console.error('Error loading enriched domains:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to load enriched domains'
    }, { status: 500 });
  }
}