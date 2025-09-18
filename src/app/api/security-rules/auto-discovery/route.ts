import { NextRequest, NextResponse } from 'next/server';
import { CloudflareAPI } from '@/lib/cloudflare';
import { safeReadJsonFile, safeWriteJsonFile } from '@/lib/fileSystem';
import { v4 as uuidv4 } from 'uuid';

interface AutoDiscoveryRequest {
  zoneId: string;
  customRules: Array<{
    cloudflareRuleId: string;
    expression: string;
    action: string;
    description?: string;
  }>;
}

interface TemplateCandidate {
  expression: string;
  action: string;
  description?: string;
  confidence: number;
  suggestedName: string;
  suggestedFriendlyId: string;
}

export async function POST(request: NextRequest) {
  try {
    const apiToken = request.headers.get('x-api-token');
    if (!apiToken) {
      return NextResponse.json({ error: 'API token requerido' }, { status: 401 });
    }

    const body: AutoDiscoveryRequest = await request.json();
    const { zoneId, customRules } = body;

    if (!zoneId || !customRules || !Array.isArray(customRules)) {
      return NextResponse.json({ error: 'zoneId y customRules son requeridos' }, { status: 400 });
    }

    console.log(`[AutoDiscovery] Starting auto-discovery for zone ${zoneId} with ${customRules.length} custom rules`);

    // Load existing templates to avoid duplicates
    const templatesPath = 'security-rules-templates.json';
    let existingTemplates: any[] = [];
    try {
      const templatesData = await safeReadJsonFile(templatesPath);
      existingTemplates = templatesData.templates || [];
    } catch (error) {
      console.warn('[AutoDiscovery] No existing templates found, starting fresh');
      existingTemplates = [];
    }

    // Analyze custom rules for template candidates
    const candidates: TemplateCandidate[] = [];

    for (const rule of customRules) {
      console.log(`[AutoDiscovery] Analyzing rule:`, {
        description: rule.description,
        action: rule.action,
        expression: rule.expression?.substring(0, 100) + '...'
      });
      const candidate = analyzeRuleForTemplate(rule, existingTemplates);
      console.log(`[AutoDiscovery] Candidate result:`, candidate);
      if (candidate && candidate.confidence >= 0.7) { // Only high-confidence candidates
        candidates.push(candidate);
      } else if (candidate) {
        console.log(`[AutoDiscovery] Rule skipped - confidence too low: ${candidate.confidence} < 0.7`);
      }
    }

    console.log(`[AutoDiscovery] Found ${candidates.length} template candidates with confidence >= 0.7`);

    let templatesCreated = 0;

    // Create templates from candidates
    for (const candidate of candidates) {
      try {
        const newTemplate = {
          id: uuidv4(),
          friendlyId: candidate.suggestedFriendlyId,
          name: candidate.suggestedName,
          description: `Auto-discovered template: ${candidate.suggestedName}`,
          version: '1.0.0',
          expression: candidate.expression,
          action: candidate.action,
          enabled: true,
          priority: 100,
          tags: ['auto-discovered'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          applicableTags: [],
          excludedDomains: [],
          actionParameters: candidate.action === 'challenge' ? { challenge: { type: 'managed' } } : undefined
        };

        existingTemplates.push(newTemplate);
        templatesCreated++;

        console.log(`[AutoDiscovery] Created template ${newTemplate.friendlyId}: ${newTemplate.name}`);
      } catch (error) {
        console.error('[AutoDiscovery] Error creating template:', error);
      }
    }

    // Save updated templates
    if (templatesCreated > 0) {
      try {
        console.log(`[AutoDiscovery] Attempting to save ${templatesCreated} templates to: ${templatesPath}`);
        await safeWriteJsonFile(templatesPath, {
          templates: existingTemplates,
          lastUpdated: new Date().toISOString()
        });

        console.log(`[AutoDiscovery] ✅ Successfully saved ${templatesCreated} new templates to ${templatesPath}`);
      } catch (writeError) {
        console.error(`[AutoDiscovery] ❌ Failed to save templates:`, writeError);
        throw new Error(`Failed to save templates: ${writeError instanceof Error ? writeError.message : 'Unknown error'}`);
      }
    }

    return NextResponse.json({
      success: true,
      templatesCreated,
      candidates: candidates.map(c => ({
        name: c.suggestedName,
        friendlyId: c.suggestedFriendlyId,
        confidence: c.confidence
      }))
    });

  } catch (error) {
    console.error('[AutoDiscovery] Error in auto-discovery:', error);
    return NextResponse.json({
      error: 'Error interno del servidor',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

function analyzeRuleForTemplate(
  rule: { expression: string; action: string; description?: string },
  existingTemplates: any[]
): TemplateCandidate | null {
  const { expression, action, description } = rule;

  // Skip if template already exists
  const duplicate = existingTemplates.find(t =>
    t.expression === expression ||
    (description && t.name.includes(extractRuleName(description)))
  );
  if (duplicate) {
    console.log(`[AutoDiscovery] Skipping duplicate rule: ${description || expression.substring(0, 50)}`);
    return null;
  }

  // Analyze expression patterns for common security rules
  let confidence = 0;
  let suggestedName = '';
  let category = '';

  // SQL Injection patterns
  if (expression.includes('sql') || expression.includes('union') || expression.includes('select') ||
      expression.includes('insert') || expression.includes('delete') || expression.includes('drop')) {
    confidence += 0.8;
    category = 'SQL_INJECTION';
    suggestedName = 'SQL Injection Protection';
  }

  // XSS patterns
  if (expression.includes('script') || expression.includes('javascript') || expression.includes('xss') ||
      expression.includes('<script') || expression.includes('onclick') || expression.includes('onerror')) {
    confidence += 0.8;
    category = 'XSS';
    suggestedName = 'XSS Protection';
  }

  // LFI/RFI patterns
  if (expression.includes('..') || expression.includes('/etc/passwd') || expression.includes('php://') ||
      expression.includes('file://') || expression.includes('include')) {
    confidence += 0.8;
    category = 'LFI_RFI';
    suggestedName = 'File Inclusion Protection';
  }

  // Rate limiting patterns
  if (expression.includes('rate') || expression.includes('req/s') || expression.includes('requests') ||
      expression.includes('limit') || expression.includes('throttle')) {
    confidence += 0.7;
    category = 'RATE_LIMIT';
    suggestedName = 'Rate Limiting';
  }

  // Bot patterns (enhanced)
  if (expression.includes('bot') || expression.includes('crawler') || expression.includes('spider') ||
      expression.includes('user-agent') || expression.includes('automated') ||
      expression.includes('cf.client.bot') || expression.includes('user_agent contains')) {
    confidence += 0.8;
    category = 'BOT_PROTECTION';
    suggestedName = 'Bot Protection';
  }

  // Geographic patterns (enhanced)
  if (expression.includes('ip.geoip.country') || expression.includes('geoip') || expression.includes('country')) {
    confidence += 0.7;
    category = 'GEO_BLOCKING';
    suggestedName = 'Geographic Blocking';
  }

  // WAF/Security patterns (new)
  if (expression.includes('whitelist_ip') || expression.includes('$whitelist') ||
      expression.includes('well-known') || (expression.includes('geoip') && expression.includes('bot'))) {
    confidence += 0.8;
    category = 'WAF_SECURITY';
    suggestedName = 'WAF Security Rule';
  }

  // Challenge/Block actions (enhanced)
  if (action === 'managed_challenge' || action === 'js_challenge' || action === 'challenge') {
    confidence += 0.6;
    if (category === '') {
      category = 'CHALLENGE_SECURITY';
      suggestedName = 'Security Challenge';
    }
  }

  // If no specific pattern found but action is block/challenge, still consider it
  if (confidence === 0 && (action === 'block' || action === 'challenge')) {
    confidence = 0.5;
    category = 'CUSTOM_SECURITY';
    suggestedName = 'Custom Security Rule';
  }

  if (confidence < 0.5) {
    return null;
  }

  // Generate friendly ID
  const existingCount = existingTemplates.filter(t =>
    t.friendlyId && t.friendlyId.includes(category.substring(0, 3))
  ).length;
  const suggestedFriendlyId = `R${String(existingTemplates.length + 1).padStart(2, '0')}`;

  // Extract name from description if available
  if (description && description.trim()) {
    const extractedName = extractRuleName(description);
    if (extractedName.length > 5) {
      suggestedName = extractedName;
    }
  }

  return {
    expression,
    action,
    description,
    confidence,
    suggestedName,
    suggestedFriendlyId
  };
}

function extractRuleName(description: string): string {
  // Clean up common prefixes/suffixes from rule descriptions
  return description
    .replace(/^(rule|security|firewall|waf|custom)[:|\s]/i, '')
    .replace(/\s*(rule|security|firewall|waf)$/i, '')
    .replace(/[#\[\]()]/g, '')
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}