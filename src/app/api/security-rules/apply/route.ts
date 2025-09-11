import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { CloudflareAPI } from '@/lib/cloudflare';
import { BulkRuleApplication, RuleTemplate, ConflictResolution } from '@/types/cloudflare';

const RULES_TEMPLATES_FILE = path.join(process.cwd(), 'security-rules-templates.json');
const APPLICATION_LOG_FILE = path.join(process.cwd(), 'rule-application-log.json');

interface RulesTemplatesCache {
  templates: RuleTemplate[];
  lastUpdated: string;
}

interface ApplicationLog {
  id: string;
  templateId: string;
  templateName: string;
  targetZoneIds: string[];
  conflictResolution: ConflictResolution;
  timestamp: string;
  results: BulkRuleApplication['results'];
  summary: {
    total: number;
    successful: number;
    failed: number;
    conflicts: number;
  };
}

async function loadRulesTemplates(): Promise<RulesTemplatesCache> {
  try {
    const data = await fs.readFile(RULES_TEMPLATES_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {
      templates: [],
      lastUpdated: new Date().toISOString()
    };
  }
}

async function loadApplicationLogs(): Promise<ApplicationLog[]> {
  try {
    const data = await fs.readFile(APPLICATION_LOG_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function saveApplicationLog(log: ApplicationLog): Promise<void> {
  const logs = await loadApplicationLogs();
  logs.unshift(log); // Add to beginning
  
  // Keep only last 100 logs
  if (logs.length > 100) {
    logs.splice(100);
  }
  
  await fs.writeFile(APPLICATION_LOG_FILE, JSON.stringify(logs, null, 2));
}

// POST - Apply rule template to multiple zones
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      apiToken, 
      templateId, 
      targetZoneIds, 
      conflictResolution = ConflictResolution.MANUAL,
      preview = false 
    }: BulkRuleApplication & { apiToken: string } = body;

    if (!apiToken) {
      return NextResponse.json({
        success: false,
        error: 'API token is required'
      }, { status: 400 });
    }

    if (!templateId || !targetZoneIds || targetZoneIds.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Template ID and target zones are required'
      }, { status: 400 });
    }

    const cloudflareAPI = new CloudflareAPI(apiToken);
    const templatesCache = await loadRulesTemplates();
    
    // Find the template
    const template = templatesCache.templates.find(t => t.id === templateId);
    if (!template) {
      return NextResponse.json({
        success: false,
        error: 'Template not found'
      }, { status: 404 });
    }

    if (!template.enabled) {
      return NextResponse.json({
        success: false,
        error: 'Template is disabled'
      }, { status: 400 });
    }

    const results: BulkRuleApplication['results'] = [];

    // Get zone information first
    const zonesResponse = await cloudflareAPI.getZones(1, 200);
    const zoneMap = new Map(zonesResponse.zones.map(zone => [zone.id, zone.name]));

    // Process each target zone
    for (const zoneId of targetZoneIds) {
      const domainName = zoneMap.get(zoneId) || zoneId;
      const result = {
        zoneId,
        domainName,
        success: false,
        error: undefined as string | undefined,
        appliedRuleId: undefined as string | undefined,
        conflicts: [] as any[]
      };

      try {
        // Check if domain is in excluded list
        if (template.excludedDomains.includes(domainName)) {
          result.error = 'Domain is excluded from this template';
          results.push(result);
          continue;
        }

        // Get existing security rules for this zone
        const existingRules = await cloudflareAPI.getZoneSecurityRules(zoneId);
        
        // Check for conflicts
        const conflictingRules = existingRules.filter(rule => {
          // Check for identical expressions
          if (rule.expression === template.expression) {
            return true;
          }
          
          // Check for similar expressions (simplified)
          const similarity = calculateExpressionSimilarity(template.expression, rule.expression);
          return similarity > 0.8;
        });

        if (conflictingRules.length > 0) {
          result.conflicts = conflictingRules.map(rule => ({
            cloudflareRuleId: rule.id,
            expression: rule.expression,
            action: rule.action,
            description: rule.description,
            rulesetId: rule.rulesetId
          }));

          // Handle conflicts based on resolution strategy
          switch (conflictResolution) {
            case ConflictResolution.SKIP:
              result.error = `Conflicts detected (${conflictingRules.length}), skipped as requested`;
              results.push(result);
              continue;

            case ConflictResolution.MANUAL:
              result.error = `Manual resolution required for ${conflictingRules.length} conflicts`;
              results.push(result);
              continue;

            case ConflictResolution.REPLACE:
              if (!preview) {
                // Remove conflicting rules
                for (const conflictingRule of conflictingRules) {
                  try {
                    await cloudflareAPI.removeRuleFromZone(zoneId, conflictingRule.id);
                  } catch (removeError) {
                    console.warn(`Failed to remove conflicting rule ${conflictingRule.id}:`, removeError);
                  }
                }
              }
              break;

            case ConflictResolution.MERGE:
              // For now, treat merge as replace
              // TODO: Implement actual merge logic
              result.error = 'Merge resolution not yet implemented';
              results.push(result);
              continue;
          }
        }

        // Apply the rule (unless it's a preview)
        if (!preview) {
          const newRule = {
            id: uuidv4(),
            expression: template.expression,
            action: template.action,
            action_parameters: template.actionParameters,
            description: `${template.name} - ${template.description}`,
            enabled: template.enabled
          };

          const updatedRuleset = await cloudflareAPI.addRuleToZone(zoneId, newRule);
          result.appliedRuleId = newRule.id;
          result.success = true;
        } else {
          // Preview mode - just mark as successful
          result.success = true;
          result.appliedRuleId = 'preview-mode';
        }

      } catch (error) {
        result.error = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error(`Error applying rule to zone ${zoneId}:`, error);
      }

      results.push(result);
    }

    // Calculate summary
    const summary = {
      total: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      conflicts: results.reduce((sum, r) => sum + (r.conflicts?.length || 0), 0)
    };

    // Save application log (unless it's a preview)
    if (!preview) {
      const applicationLog: ApplicationLog = {
        id: uuidv4(),
        templateId: template.id,
        templateName: template.name,
        targetZoneIds,
        conflictResolution,
        timestamp: new Date().toISOString(),
        results,
        summary
      };

      await saveApplicationLog(applicationLog);
    }

    const bulkApplication: BulkRuleApplication = {
      templateId,
      targetZoneIds,
      conflictResolution,
      preview,
      results
    };

    return NextResponse.json({
      success: true,
      data: {
        application: bulkApplication,
        summary,
        preview
      }
    });

  } catch (error) {
    console.error('Error applying security rules:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to apply security rules'
    }, { status: 500 });
  }
}

// GET - Get application history
export async function GET() {
  try {
    const logs = await loadApplicationLogs();
    return NextResponse.json({
      success: true,
      data: {
        applications: logs
      }
    });
  } catch (error) {
    console.error('Error loading application history:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to load application history'
    }, { status: 500 });
  }
}

// Helper function to calculate expression similarity
function calculateExpressionSimilarity(expr1: string, expr2: string): number {
  const keywords1 = new Set(expr1.toLowerCase().match(/\w+/g) || []);
  const keywords2 = new Set(expr2.toLowerCase().match(/\w+/g) || []);
  
  const intersection = new Set([...keywords1].filter(x => keywords2.has(x)));
  const union = new Set([...keywords1, ...keywords2]);
  
  return intersection.size / union.size;
}