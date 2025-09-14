import { NextRequest, NextResponse } from 'next/server';
import { CloudflareAPI } from '@/lib/cloudflare';
import { DomainRuleStatus, RuleConflict, RuleTemplate, ConflictResolution } from '@/types/cloudflare';
import { safeReadJsonFile, safeWriteJsonFile } from '@/lib/fileSystem';

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

// Helper function to detect rule conflicts
function detectConflicts(
  corporateTemplates: RuleTemplate[],
  existingRules: Array<any>
): RuleConflict[] {
  const conflicts: RuleConflict[] = [];

  for (const template of corporateTemplates) {
    for (const existingRule of existingRules) {
      const conflictType = analyzeConflict(template.expression, existingRule.expression, template.action, existingRule.action);
      
      if (conflictType) {
        conflicts.push({
          zoneId: '',
          domainName: '',
          corporateRuleId: template.id,
          corporateRuleName: template.name,
          conflictingRule: {
            cloudflareRuleId: existingRule.id,
            expression: existingRule.expression,
            action: existingRule.action,
            description: existingRule.description
          },
          conflictType,
          suggestedResolution: getSuggestedResolution(conflictType),
          confidence: getConflictConfidence(conflictType, template.expression, existingRule.expression)
        });
      }
    }
  }

  return conflicts;
}

function analyzeConflict(
  templateExpression: string,
  existingExpression: string,
  templateAction: string,
  existingAction: string
): 'identical' | 'similar' | 'contradictory' | 'overlapping' | null {
  // Identical expressions
  if (templateExpression === existingExpression) {
    return templateAction === existingAction ? 'identical' : 'contradictory';
  }

  // Similar expressions (basic similarity check)
  const similarity = calculateExpressionSimilarity(templateExpression, existingExpression);
  if (similarity > 0.8) {
    return 'similar';
  }

  // Overlapping rules (contain similar patterns)
  if (similarity > 0.5) {
    return 'overlapping';
  }

  return null;
}

function calculateExpressionSimilarity(expr1: string, expr2: string): number {
  // Simple similarity calculation based on common keywords
  const keywords1 = new Set(expr1.toLowerCase().match(/\w+/g) || []);
  const keywords2 = new Set(expr2.toLowerCase().match(/\w+/g) || []);
  
  const intersection = new Set([...keywords1].filter(x => keywords2.has(x)));
  const union = new Set([...keywords1, ...keywords2]);
  
  return intersection.size / union.size;
}

function getSuggestedResolution(conflictType: string): ConflictResolution {
  switch (conflictType) {
    case 'identical':
      return ConflictResolution.SKIP;
    case 'similar':
      return ConflictResolution.REPLACE;
    case 'contradictory':
      return ConflictResolution.MANUAL;
    case 'overlapping':
      return ConflictResolution.MERGE;
    default:
      return ConflictResolution.MANUAL;
  }
}

function getConflictConfidence(
  conflictType: string,
  templateExpr: string,
  existingExpr: string
): number {
  switch (conflictType) {
    case 'identical':
      return 1.0;
    case 'similar':
      return calculateExpressionSimilarity(templateExpr, existingExpr);
    case 'contradictory':
      return 0.9;
    case 'overlapping':
      return 0.7;
    default:
      return 0.5;
  }
}

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
      // Analyze all zones
      const zonesResponse = await cloudflareAPI.getZones(1, 100);
      targetZoneIds = zonesResponse.zones.map(zone => zone.id);
    }

    const analysisResults: DomainRuleStatus[] = [];
    
    for (const zoneId of targetZoneIds) {
      try {
        // Get zone info
        const zonesResponse = await cloudflareAPI.getZones();
        const zone = zonesResponse.zones.find(z => z.id === zoneId);
        if (!zone) continue;

        // Check if we have cached analysis and it's recent
        const existingStatus = domainRulesCache.domainStatuses.find(ds => ds.zoneId === zoneId);
        const cacheAge = existingStatus ? Date.now() - new Date(existingStatus.lastAnalyzed).getTime() : Infinity;
        const cacheValidityMs = 30 * 60 * 1000; // 30 minutes

        if (!forceRefresh && existingStatus && cacheAge < cacheValidityMs) {
          analysisResults.push(existingStatus);
          continue;
        }

        // Get current security rules for this zone
        const existingRules = await cloudflareAPI.getZoneSecurityRules(zoneId);
        
        // Analyze against corporate templates
        const appliedRules = [];
        const customRules = [];

        for (const rule of existingRules) {
          // Try to match with corporate templates
          const matchingTemplate = templatesCache.templates.find(template => 
            template.expression === rule.expression && template.action === rule.action
          );

          if (matchingTemplate) {
            appliedRules.push({
              ruleId: matchingTemplate.id,
              ruleName: matchingTemplate.name,
              version: matchingTemplate.version,
              status: 'active' as const,
              cloudflareRulesetId: rule.rulesetId,
              cloudflareRuleId: rule.id
            });
          } else {
            // Check for outdated versions (similar expressions)
            const similarTemplate = templatesCache.templates.find(template => {
              const similarity = calculateExpressionSimilarity(template.expression, rule.expression);
              return similarity > 0.8 && template.action === rule.action;
            });

            if (similarTemplate) {
              appliedRules.push({
                ruleId: similarTemplate.id,
                ruleName: similarTemplate.name,
                version: similarTemplate.version,
                status: 'outdated' as const,
                cloudflareRulesetId: rule.rulesetId,
                cloudflareRuleId: rule.id
              });
            } else {
              // This is a custom rule
              customRules.push({
                cloudflareRulesetId: rule.rulesetId,
                cloudflareRuleId: rule.id,
                expression: rule.expression,
                action: rule.action,
                description: rule.description
              });
            }
          }
        }

        const domainStatus: DomainRuleStatus = {
          zoneId,
          domainName: zone.name,
          appliedRules,
          customRules,
          lastAnalyzed: new Date().toISOString()
        };

        analysisResults.push(domainStatus);

        // Update cache
        const existingIndex = domainRulesCache.domainStatuses.findIndex(ds => ds.zoneId === zoneId);
        if (existingIndex !== -1) {
          domainRulesCache.domainStatuses[existingIndex] = domainStatus;
        } else {
          domainRulesCache.domainStatuses.push(domainStatus);
        }

      } catch (error) {
        console.error(`Error analyzing zone ${zoneId}:`, error);
        // Continue with other zones
      }
    }

    // Save updated cache
    await saveDomainRulesCache(domainRulesCache);

    // Detect conflicts across all analyzed domains
    const allConflicts: RuleConflict[] = [];
    for (const domainStatus of analysisResults) {
      const domainConflicts = detectConflicts(templatesCache.templates, domainStatus.customRules);
      for (const conflict of domainConflicts) {
        conflict.zoneId = domainStatus.zoneId;
        conflict.domainName = domainStatus.domainName;
      }
      allConflicts.push(...domainConflicts);
    }

    return NextResponse.json({
      success: true,
      data: {
        domainStatuses: analysisResults,
        conflicts: allConflicts,
        summary: {
          totalDomains: analysisResults.length,
          domainsWithCorporateRules: analysisResults.filter(ds => ds.appliedRules.length > 0).length,
          domainsWithCustomRules: analysisResults.filter(ds => ds.customRules.length > 0).length,
          outdatedRules: allConflicts.filter(c => c.conflictType === 'identical' || c.conflictType === 'similar').length,
          totalConflicts: allConflicts.length
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