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
 * Create Cloudflare rule name with template prefix
 * Format: "R001-Original Name" (simple prefix for easy detection)
 */
export function createCloudflareRuleName(originalName: string, friendlyId: string, version: string): string {
  return `${friendlyId}-${originalName}`;
}

/**
 * Parse Cloudflare rule name to extract template info
 * Returns null if not a template rule
 * Format: "R001-Original Name"
 */
export function parseCloudflareRuleName(cloudflareRuleName: string): {
  originalName: string;
  friendlyId: string;
  version: string;
} | null {
  // Simple prefix pattern: R001-Something
  const pattern = /^(R\d{3})-(.+)$/;
  const match = cloudflareRuleName.match(pattern);

  if (!match) {
    return null;
  }

  return {
    originalName: match[2],
    friendlyId: match[1],
    version: '1.0' // Default version since we're simplifying
  };
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