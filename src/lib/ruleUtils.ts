import { RuleTemplate } from '@/types/cloudflare';

// Utility functions for rule management

/**
 * Generate next friendly ID (R001, R002, etc.)
 */
export function generateNextFriendlyId(existingTemplates: RuleTemplate[]): string {
  const existingIds = existingTemplates
    .map(template => template.friendlyId)
    .filter(id => id.match(/^R\d{3}$/))
    .map(id => parseInt(id.substring(1)))
    .sort((a, b) => a - b);

  let nextNumber = 1;
  for (const num of existingIds) {
    if (num === nextNumber) {
      nextNumber++;
    } else {
      break;
    }
  }

  return `R${nextNumber.toString().padStart(3, '0')}`;
}

/**
 * Create Cloudflare rule name with template prefix and version
 * Format: "R001-Original Name #v1.2" (includes version for proper tracking)
 */
export function createCloudflareRuleName(originalName: string, friendlyId: string, version: string): string {
  return `${friendlyId}-${originalName} #v${version}`;
}

/**
 * Parse Cloudflare rule name to extract template info
 * Returns null if not a template rule
 * Format: "R001-Original Name #v1.2" or "R001-Original Name" (legacy)
 */
export function parseCloudflareRuleName(cloudflareRuleName: string): {
  originalName: string;
  friendlyId: string;
  version: string;
} | null {
  // New format with version: R001-Something #v1.2
  const patternWithVersion = /^(R\d{3})-(.+) #v([\d.]+)$/;
  const matchWithVersion = cloudflareRuleName.match(patternWithVersion);

  if (matchWithVersion) {
    return {
      originalName: matchWithVersion[2],
      friendlyId: matchWithVersion[1],
      version: matchWithVersion[3]
    };
  }

  // Legacy format without version: R001-Something
  const patternLegacy = /^(R\d{3})-(.+)$/;
  const matchLegacy = cloudflareRuleName.match(patternLegacy);

  if (matchLegacy) {
    return {
      originalName: matchLegacy[2],
      friendlyId: matchLegacy[1],
      version: '1.0' // Default version for legacy rules
    };
  }

  return null;
}

/**
 * Check if a Cloudflare rule is from our template system
 * Simple check for R001- prefix pattern
 */
export function isTemplateRule(cloudflareRuleName: string): boolean {
  return /^R\d{3}-/.test(cloudflareRuleName);
}

/**
 * Compare versions (semantic versioning)
 * Returns: -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
export function compareVersions(version1: string, version2: string): number {
  const v1Parts = version1.split('.').map(Number);
  const v2Parts = version2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
    const v1Part = v1Parts[i] || 0;
    const v2Part = v2Parts[i] || 0;
    
    if (v1Part < v2Part) return -1;
    if (v1Part > v2Part) return 1;
  }
  
  return 0;
}

/**
 * Increment version number
 * 1.0 -> 1.1, 1.9 -> 2.0
 */
export function incrementVersion(version: string, major = false): string {
  const parts = version.split('.').map(Number);
  
  if (major) {
    parts[0]++;
    parts[1] = 0;
  } else {
    parts[1]++;
    if (parts[1] >= 10) {
      parts[0]++;
      parts[1] = 0;
    }
  }
  
  return parts.join('.');
}

/**
 * Find template by friendly ID
 */
export function findTemplateByFriendlyId(templates: RuleTemplate[], friendlyId: string): RuleTemplate | undefined {
  return templates.find(template => template.friendlyId === friendlyId);
}

/**
 * Get display name for rule (friendly ID + name)
 */
export function getRuleDisplayName(template: RuleTemplate): string {
  return `${template.friendlyId} - ${template.name}`;
}

/**
 * Validate friendly ID format
 */
export function isValidFriendlyId(friendlyId: string): boolean {
  return /^R\d{3}$/.test(friendlyId);
}

/**
 * Extract rule IDs from a domain's applied rules
 */
export function extractAppliedRuleIds(appliedRules: Array<{ ruleName: string }>): string[] {
  return appliedRules
    .map(rule => parseCloudflareRuleName(rule.ruleName))
    .filter(parsed => parsed !== null)
    .map(parsed => parsed!.friendlyId);
}

/**
 * Count custom (non-template) rules
 */
export function countCustomRules(allRules: Array<{ name: string }>): number {
  return allRules.filter(rule => !isTemplateRule(rule.name)).length;
}

/**
 * Detect if a rule description follows template format: "ID - Name #version"
 * This is used for auto-importing templates from existing rules
 * Supports multiple formats for better compatibility with existing rules
 */
export function isTemplateFormat(description: string): boolean {
  const trimmed = description.trim();

  // Pattern 1: "R001 - Rule Name #v1.2" or "R001 - Rule Name #1.2"
  const templatePattern1 = /^R\d{3}\s*-\s*.+\s*#v?[\d.]+$/;

  // Pattern 2: "R001: Rule Name v1.2" or "R001: Rule Name 1.2"
  const templatePattern2 = /^R\d{3}\s*:\s*.+\s*v?[\d.]+$/;

  // Pattern 3: "[R001] Rule Name (v1.2)" or "[R001] Rule Name (1.2)"
  const templatePattern3 = /^\[R\d{3}\]\s*.+\s*\(v?[\d.]+\)$/;

  // Pattern 4: "Rule Name - R001 v1.2"
  const templatePattern4 = /.+\s*-\s*R\d{3}\s*v?[\d.]+$/;

  // Pattern 5: "R001 Rule Name v1.2" (without separator)
  const templatePattern5 = /^R\d{3}\s+.+\s*v?[\d.]+$/;

  // Pattern 6: Just "R001" at the beginning (basic template detection)
  const templatePattern6 = /^R\d{3}/;

  // Pattern 7: Common Cloudflare rule patterns that might be templates
  const templatePattern7 = /\b(block|challenge|managed_challenge|allow|log|skip)\b.*\b(bot|spam|attack|threat|malware|exploit|sql|injection|xss|csrf)\b/i;

  // Pattern 8: Common WAF/security rule names
  const templatePattern8 = /\b(waf|waf02|security|firewall|protection|defense|guard)\b/i;

  // Pattern 9: Rules with complex expressions (likely custom security rules)
  const templatePattern9 = /\b(cf\.client\.bot|http\.user_agent|ip\.geoip\.country|http\.request\.uri\.query)\b/i;

  // Pattern 10: Exact match for "waf02" (common Cloudflare WAF rule name)
  const templatePattern10 = /^waf02$/i;

  // Pattern 11: Common bot management patterns
  const templatePattern11 = /\b(bot|spider|crawler|scraper)\b.*\b(block|challenge|allow)\b/i;

  return templatePattern1.test(trimmed) ||
         templatePattern2.test(trimmed) ||
         templatePattern3.test(trimmed) ||
         templatePattern4.test(trimmed) ||
         templatePattern5.test(trimmed) ||
         templatePattern6.test(trimmed) ||
         templatePattern7.test(trimmed) ||
         templatePattern8.test(trimmed) ||
         templatePattern9.test(trimmed) ||
         templatePattern10.test(trimmed) ||
         templatePattern11.test(trimmed);
}

/**
 * Parse template format to extract components
 * Supports multiple formats for better compatibility with existing rules
 */
export function parseTemplateFormat(description: string): {
  friendlyId: string;
  name: string;
  version: string;
} | null {
  const trimmed = description.trim();

  // Pattern 1: "R001 - Rule Name #v1.2"
  const pattern1 = /^R(\d{3})\s*-\s*(.+?)\s*#v([\d.]+)$/;
  const match1 = trimmed.match(pattern1);
  if (match1) {
    return {
      friendlyId: `R${match1[1]}`,
      name: match1[2].trim(),
      version: match1[3]
    };
  }

  // Pattern 2: "R001 - Rule Name #1.2" (without v prefix)
  const pattern2 = /^R(\d{3})\s*-\s*(.+?)\s*#([\d.]+)$/;
  const match2 = trimmed.match(pattern2);
  if (match2) {
    return {
      friendlyId: `R${match2[1]}`,
      name: match2[2].trim(),
      version: match2[3]
    };
  }

  // Pattern 3: "R001: Rule Name v1.2"
  const pattern3 = /^R(\d{3})\s*:\s*(.+?)\s*v([\d.]+)$/;
  const match3 = trimmed.match(pattern3);
  if (match3) {
    return {
      friendlyId: `R${match3[1]}`,
      name: match3[2].trim(),
      version: match3[3]
    };
  }

  // Pattern 4: "[R001] Rule Name (v1.2)"
  const pattern4 = /^\[R(\d{3})\]\s*(.+?)\s*\(v?([\d.]+)\)$/;
  const match4 = trimmed.match(pattern4);
  if (match4) {
    return {
      friendlyId: `R${match4[1]}`,
      name: match4[2].trim(),
      version: match4[3]
    };
  }

  // Pattern 5: "Rule Name - R001 v1.2"
  const pattern5 = /^(.+?)\s*-\s*R(\d{3})\s*v?([\d.]+)$/;
  const match5 = trimmed.match(pattern5);
  if (match5) {
    return {
      friendlyId: `R${match5[2]}`,
      name: match5[1].trim(),
      version: match5[3]
    };
  }

  // Pattern 6: "R001 Rule Name v1.2" (without separator)
  const pattern6 = /^R(\d{3})\s+(.+?)\s+v?([\d.]+)$/;
  const match6 = trimmed.match(pattern6);
  if (match6) {
    return {
      friendlyId: `R${match6[1]}`,
      name: match6[2].trim(),
      version: match6[3]
    };
  }

  // Pattern 7: Just "R001" at the beginning - generate generic name
  const pattern7 = /^R(\d{3})/;
  const match7 = trimmed.match(pattern7);
  if (match7) {
    // Extract name from the rest of the description
    const namePart = trimmed.replace(pattern7, '').trim();
    const name = namePart || `Rule ${match7[1]}`;
    return {
      friendlyId: `R${match7[1]}`,
      name: name,
      version: '1.0' // Default version
    };
  }

  // Pattern 8: Common security rule patterns - generate template from keywords
  const securityPattern = /\b(block|challenge|managed_challenge|allow|log|skip)\b.*\b(bot|spam|attack|threat|malware|exploit|sql|injection|xss|csrf)\b/i;
  if (securityPattern.test(trimmed)) {
    // Generate a friendly ID for this rule
    const action = trimmed.match(/\b(block|challenge|managed_challenge|allow|log|skip)\b/i)?.[1] || 'block';
    const threat = trimmed.match(/\b(bot|spam|attack|threat|malware|exploit|sql|injection|xss|csrf)\b/i)?.[1] || 'threat';

    // Create a simple name from the pattern
    const name = `${action.charAt(0).toUpperCase() + action.slice(1)} ${threat.charAt(0).toUpperCase() + threat.slice(1)}`;

    return {
      friendlyId: 'R001', // Default ID, will be updated by the caller
      name: name,
      version: '1.0'
    };
  }

  // Pattern 9: Exact match for "waf02" - common Cloudflare WAF rule
  if (trimmed.toLowerCase() === 'waf02') {
    return {
      friendlyId: 'R001', // Will be updated by caller with proper ID
      name: 'WAF Protection Rule',
      version: '1.0'
    };
  }

  // Pattern 10: Other common WAF/security rule names
  const wafPattern = /\b(waf|security|firewall|protection|defense|guard)\b/i;
  if (wafPattern.test(trimmed)) {
    const matched = trimmed.match(wafPattern)?.[0] || 'Security';
    return {
      friendlyId: 'R001', // Will be updated by caller
      name: `${matched.charAt(0).toUpperCase() + matched.slice(1)} Rule`,
      version: '1.0'
    };
  }

  return null;
}

/**
 * Create template from rule data
 */
export function createTemplateFromRule(rule: any, parsedTemplate: {
  friendlyId: string;
  name: string;
  version: string;
}, existingTemplates: RuleTemplate[]): RuleTemplate {
  // Calculate priority based on existing templates
  const maxPriority = existingTemplates.length > 0
    ? Math.max(...existingTemplates.map(t => t.priority || 0))
    : 0;

  return {
    id: `template-${parsedTemplate.friendlyId}-${Date.now()}`,
    friendlyId: parsedTemplate.friendlyId,
    name: parsedTemplate.name,
    description: `Auto-imported from existing rule: ${rule.description}`,
    version: parsedTemplate.version,
    expression: rule.expression || '',
    action: rule.action || 'block',
    actionParameters: rule.action_parameters || {},
    enabled: rule.enabled !== false,
    priority: maxPriority + 1,
    tags: [],
    applicableTags: [],
    excludedDomains: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}