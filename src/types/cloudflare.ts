export interface CloudflareZone {
  id: string;
  name: string;
  status: string;
  paused: boolean;
}

export interface CloudflareDNSRecord {
  id: string;
  zone_id: string;
  zone_name: string;
  name: string;
  type: string;
  content: string;
  proxiable: boolean;
  proxied: boolean;
  ttl: number;
  locked: boolean;
  meta: {
    auto_added: boolean;
    managed_by_apps: boolean;
    managed_by_argo_tunnel: boolean;
    source: string;
  };
  comment?: string;
  tags: string[];
  created_on: string;
  modified_on: string;
}

export interface CloudflareApiResponse<T> {
  success: boolean;
  errors: Array<{
    code: number;
    message: string;
  }>;
  messages: Array<{
    code: number;
    message: string;
  }>;
  result: T;
  result_info?: {
    page: number;
    per_page: number;
    count: number;
    total_count: number;
    total_pages: number;
  };
}

export interface RulePillData {
  id: string;
  name: string;
  version: string;
  domainVersion?: string;
  isUpdated: boolean;
  action: string;
  type: string;
  lastUpdated: Date;
  expression: string;
  templateId?: string;
}

export interface DomainStatus {
  domain: string;
  zoneId: string;
  rootRecord?: CloudflareDNSRecord;
  wwwRecord?: CloudflareDNSRecord;
  rootProxied: boolean;
  wwwProxied: boolean;
  underAttackMode?: boolean;
  botFightMode?: boolean;
  rulePills?: RulePillData[];
  securityRules?: {
    totalRules: number;
    corporateRules: number;
    customRules: number;
    hasConflicts: boolean;
    lastAnalyzed?: string;
    templateRules?: Array<{
      friendlyId: string;
      version: string;
      isOutdated: boolean;
      name: string;
    }>;
  };
}

// Security Rules Types
export interface SecurityRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
  expression: string; // Cloudflare rule expression
  action: 'block' | 'challenge' | 'managed_challenge' | 'allow' | 'log' | 'skip';
  actionParameters?: {
    response?: {
      status_code?: number;
      content?: string;
      content_type?: string;
    };
  };
  tags: string[]; // Para categorizar reglas
  createdAt: string;
  updatedAt: string;
  version: string; // Control de versiones
}

export interface CloudflareRuleset {
  id: string;
  name: string;
  description?: string;
  kind: string;
  version: string;
  rules: CloudflareRule[];
  last_updated: string;
  phase: string;
}

export interface CloudflareRule {
  id: string;
  expression: string;
  action: string;
  action_parameters?: any;
  description?: string;
  enabled?: boolean;
  logging?: {
    enabled?: boolean;
  };
  ref?: string;
  version?: string;
  last_updated?: string;
  created_on?: string;
}

export interface DomainRuleStatus {
  zoneId: string;
  domainName: string;
  appliedRules: Array<{
    ruleId: string;
    ruleName: string;
    version: string;
    status: 'active' | 'outdated' | 'conflict';
    cloudflareRulesetId: string;
    cloudflareRuleId: string;
    rulesetName?: string; // Name of the ruleset containing this rule
    friendlyId?: string; // Template friendly ID (e.g., R001)
    confidence?: number; // Confidence level for template matching (0-1)
    appliedAt?: string; // When the rule was applied/detected
  }>;
  lastAnalyzed: string;
  analysisMetadata?: {
    processingTimeMs?: number; // Time taken to analyze this domain
    rulesProcessed?: number; // Total rules processed
    templatesMatched?: number; // Templates successfully matched
    errors?: string[]; // Any errors encountered during analysis
  };
}

export enum ConflictResolution {
  REPLACE = 'replace', // Reemplazar regla antigua
  MERGE = 'merge',     // Combinar condiciones
  SKIP = 'skip',       // Mantener regla existente
  MANUAL = 'manual'    // Requiere intervención manual
}

export interface RuleConflict {
  zoneId: string;
  domainName: string;
  corporateRuleId: string;
  corporateRuleName: string;
  conflictingRule: {
    cloudflareRuleId: string;
    expression: string;
    action: string;
    description?: string;
  };
  conflictType: 'identical' | 'similar' | 'contradictory' | 'overlapping';
  suggestedResolution: ConflictResolution;
  confidence: number; // 0-1 score
}

export interface RuleTemplate extends SecurityRule {
  friendlyId: string; // R001, R002, etc.
  applicableTags: string[]; // Tags de dominios donde aplica
  excludedDomains: string[]; // Dominios excluidos explícitamente
}

export interface BulkRuleApplication {
  templateId: string;
  targetZoneIds: string[];
  conflictResolution: ConflictResolution;
  preview: boolean;
  results?: Array<{
    zoneId: string;
    domainName: string;
    success: boolean;
    error?: string;
    appliedRuleId?: string;
    conflicts?: RuleConflict[];
  }>;
}