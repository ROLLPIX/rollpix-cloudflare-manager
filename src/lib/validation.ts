/**
 * Validation schemas for API endpoints using Zod
 * Implements input validation to prevent injection attacks and data corruption
 */
import { z } from 'zod';

// Base validation schemas
export const ZoneIdSchema = z.string()
  .min(32, 'Zone ID must be at least 32 characters')
  .max(32, 'Zone ID must be exactly 32 characters')
  .regex(/^[a-f0-9]+$/, 'Zone ID must contain only lowercase hexadecimal characters');

export const ApiTokenSchema = z.string()
  .min(40, 'API token must be at least 40 characters')
  .regex(/^[a-zA-Z0-9_-]+$/, 'API token contains invalid characters');

export const DomainNameSchema = z.string()
  .min(1, 'Domain name is required')
  .max(253, 'Domain name too long')
  .regex(/^[a-zA-Z0-9.-]+$/, 'Domain name contains invalid characters')
  .refine(
    (domain) => !domain.startsWith('.') && !domain.endsWith('.'),
    'Domain name cannot start or end with a dot'
  );

// Security Mode validation
export const SecurityModeSchema = z.object({
  zoneId: ZoneIdSchema,
  mode: z.enum(['under_attack', 'bot_fight']),
  enabled: z.boolean()
});

// Proxy toggle validation
export const ProxyToggleSchema = z.object({
  zoneId: ZoneIdSchema,
  recordId: z.string().min(32, 'Record ID must be at least 32 characters'),
  proxied: z.boolean()
});

// Domain cache validation
export const DomainCacheSchema = z.object({
  domains: z.array(z.object({
    zoneId: ZoneIdSchema,
    domain: DomainNameSchema,
    rootRecord: z.object({
      id: z.string(),
      zone_id: z.string(),
      zone_name: z.string(),
      name: z.string(),
      type: z.string(),
      content: z.string(),
      proxiable: z.boolean(),
      proxied: z.boolean(),
      ttl: z.number(),
      locked: z.boolean(),
      meta: z.any(),
      comment: z.string().optional(),
      tags: z.array(z.string()),
      created_on: z.string(),
      modified_on: z.string(),
    }).optional(),
    wwwRecord: z.object({
      id: z.string(),
      zone_id: z.string(),
      zone_name: z.string(),
      name: z.string(),
      type: z.string(),
      content: z.string(),
      proxiable: z.boolean(),
      proxied: z.boolean(),
      ttl: z.number(),
      locked: z.boolean(),
      meta: z.any(),
      comment: z.string().optional(),
      tags: z.array(z.string()),
      created_on: z.string(),
      modified_on: z.string(),
    }).optional(),
    rootProxied: z.boolean(),
    wwwProxied: z.boolean()
  }))
});

// Security rules validation
export const SecurityRuleTemplateSchema = z.object({
  id: z.string().optional(),
  friendlyId: z.string()
    .regex(/^[A-Z]\d{2}$/, 'Friendly ID must be in format like R01, R02, etc.'),
  name: z.string().min(1, 'Rule name is required').max(100, 'Rule name too long'),
  description: z.string().min(1, 'Rule description is required').max(500, 'Rule description too long'),
  version: z.string()
    .regex(/^\d+\.\d+$/, 'Version must be in format X.Y (e.g., 1.0)'),
  expression: z.string().min(1, 'Rule expression is required'),
  action: z.enum(['block', 'challenge', 'allow', 'log']),
  enabled: z.boolean(),
  tags: z.array(z.string()).default([])
});

export const SecurityRulesApplySchema = z.object({
  zoneIds: z.array(ZoneIdSchema).min(1, 'At least one zone ID is required'),
  templateIds: z.array(z.string()).min(1, 'At least one template ID is required'),
  action: z.enum(['add', 'remove'])
});

export const SecurityRulesAnalyzeSchema = z.object({
  apiToken: ApiTokenSchema,
  zoneIds: z.array(ZoneIdSchema).optional(),
  forceRefresh: z.boolean().default(false)
});

// Bulk operations validation
export const BulkActionSchema = z.object({
  zoneIds: z.array(ZoneIdSchema).min(1, 'At least one zone ID is required'),
  templateIds: z.array(z.string()).min(1, 'At least one template ID is required'),
  action: z.enum(['add', 'remove', 'clean']),
  preview: z.boolean().default(false)
});

// Preferences validation
export const PreferencesSchema = z.object({
  perPage: z.number().int().min(-1).max(100).default(24),
  sortBy: z.enum(['name', 'status']).default('name'),
  filter: z.enum(['all', 'proxied', 'not-proxied']).default('all'),
  searchTerm: z.string().max(100).default(''),
  updateOptions: z.object({
    dns: z.boolean().default(true),
    firewall: z.boolean().default(false),
    reglas: z.boolean().default(true),
    selectedDomainsOnly: z.boolean().default(false)
  }).default({
    dns: true,
    firewall: false,
    reglas: true,
    selectedDomainsOnly: false
  })
});

// File operations validation (for cache security)
export const FileOperationSchema = z.object({
  fileName: z.enum([
    'domains-cache.json',
    'security-rules-templates.json',
    'domain-rules-status.json',
    'user-preferences.json'
  ])
});

// Helper function to validate and sanitize API requests
export const validateApiRequest = <T>(schema: z.ZodSchema<T>, data: unknown): T => {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.issues.map((err: any) => `${err.path.join('.')}: ${err.message}`);
      throw new Error(`Validation failed: ${errorMessages.join(', ')}`);
    }
    throw error;
  }
};

// Helper function for safe error responses
export const createValidationErrorResponse = (error: z.ZodError) => {
  const formattedErrors = error.issues.map((err: any) => ({
    field: err.path.join('.'),
    message: err.message,
    code: err.code
  }));

  return {
    error: 'Validation failed',
    details: formattedErrors,
    timestamp: new Date().toISOString()
  };
};
