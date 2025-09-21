import { CloudflareRule, RuleTemplate } from '@/types/cloudflare';
import {
  generateNextFriendlyId,
  incrementVersion,
  decrementVersion,
  parseTemplateFormat,
  isTemplateFormat,
  createTemplateFromRule
} from './ruleUtils';
import { safeReadJsonFile, safeWriteJsonFile } from './fileSystem';
import { TemplateRuleMapping } from './ruleMapping';
import { PendingChanges } from './batchCacheWriter';

const RULES_TEMPLATES_FILE = 'security-rules-templates.json';

export interface RulesTemplatesCache {
  templates: RuleTemplate[];
  lastUpdated: string;
}

export interface SyncResult {
  newTemplates: RuleTemplate[];
  updatedTemplates: RuleTemplate[];
  processedRules: Array<{
    ruleId: string;
    templateId: string;
    friendlyId: string;
    version: string;
    isOutdated: boolean;
    syncCase: 'new' | 'newer' | 'older' | 'identical';
  }>;
  propagatedDomains: string[]; // Will be populated by BatchCacheWriter after processing
  pendingChanges: PendingChanges;
}

export interface DomainInfo {
  zoneId: string;
  name: string;
}

/**
 * Clase unificada para sincronización de plantillas de reglas
 * Implementa el flujo completo: comparación directa, versionado por fecha, propagación
 */
export class TemplateSynchronizer {
  private templatesCache: RulesTemplatesCache = { templates: [], lastUpdated: '' };
  private pendingChanges: PendingChanges = {
    ruleMappings: [],
    templates: [],
    removedMappings: [],
    templateUpdates: []
  };

  constructor() {}

  /**
   * Cargar plantillas desde cache
   */
  private async loadTemplatesCache(): Promise<void> {
    try {
      this.templatesCache = await safeReadJsonFile<RulesTemplatesCache>(RULES_TEMPLATES_FILE);
    } catch {
      this.templatesCache = {
        templates: [],
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Reset pending changes for a new sync operation
   */
  private resetPendingChanges(): void {
    this.pendingChanges = {
      ruleMappings: [],
      templates: [],
      removedMappings: [],
      templateUpdates: []
    };
  }

  /**
   * Sincronizar reglas para un dominio específico
   * Implementa los 3 casos de sincronización según especificación
   * NUEVA VERSIÓN: Agrupa reglas por nombre para evitar incrementos de versión duplicados
   */
  async syncRulesForDomain(
    rules: CloudflareRule[],
    domainInfo: DomainInfo
  ): Promise<SyncResult> {
    console.log(`[TemplateSynchronizer] Starting sync for domain ${domainInfo.name} with ${rules.length} rules`);

    await this.loadTemplatesCache();
    this.resetPendingChanges();

    const result: SyncResult = {
      newTemplates: [],
      updatedTemplates: [],
      processedRules: [],
      propagatedDomains: [],
      pendingChanges: this.pendingChanges
    };

    // NUEVA LÓGICA: Agrupar reglas por nombre antes de procesar
    const groupedRules = this.groupRulesByName(rules);
    console.log(`[TemplateSynchronizer] Grouped ${rules.length} rules into ${groupedRules.size} unique names`);

    // Procesar cada grupo de reglas con el mismo nombre
    for (const [ruleName, rulesGroup] of groupedRules) {
      try {
        console.log(`[TemplateSynchronizer] Processing group "${ruleName}" with ${rulesGroup.length} rules`);

        // Determinar la regla más nueva en este grupo
        const newestRule = this.findNewestRuleInGroup(rulesGroup);
        console.log(`[TemplateSynchronizer] Newest rule in group "${ruleName}": ${newestRule.id} (${newestRule.lastModifiedDate?.toISOString()})`);

        // Procesar la regla más nueva para determinar el estado de la plantilla (sin crear mappings)
        const groupSyncResult = await this.syncSingleRuleForTemplate(newestRule.rule, domainInfo, result);

        // Asignar versiones correctas a todas las reglas en el grupo
        for (const ruleWithDate of rulesGroup) {
          const syncResult = this.assignVersionBasedOnDate(
            ruleWithDate,
            newestRule,
            groupSyncResult,
            domainInfo
          );

          result.processedRules.push({
            ruleId: ruleWithDate.rule.id,
            templateId: syncResult.templateId,
            friendlyId: syncResult.friendlyId,
            version: syncResult.version,
            isOutdated: syncResult.isOutdated,
            syncCase: syncResult.syncCase
          });
        }

      } catch (error) {
        console.error(`[TemplateSynchronizer] Error processing rule group "${ruleName}":`, error);
      }
    }

    // Note: Changes are accumulated in pendingChanges, will be written by BatchCacheWriter
    if (result.newTemplates.length > 0 || result.updatedTemplates.length > 0) {
      console.log(`[TemplateSynchronizer] Accumulated ${result.newTemplates.length} new and ${result.updatedTemplates.length} updated templates for batch writing`);
    }

    return result;
  }

  /**
   * Sincronizar una regla individual según especificación (versión original con mappings)
   */
  private async syncSingleRule(
    rule: CloudflareRule,
    domainInfo: DomainInfo,
    result: SyncResult
  ): Promise<{
    syncCase: 'new' | 'newer' | 'older' | 'identical';
    templateId: string;
    friendlyId: string;
    version: string;
    isOutdated: boolean;
  }> {
    const ruleDescription = rule.description || '';

    console.log(`[TemplateSynchronizer] Processing rule: "${ruleDescription}"`);

    // Buscar plantilla existente por comparación directa de descripción (case insensitive)
    const existingTemplate = this.templatesCache.templates.find(template =>
      template.name.toLowerCase() === ruleDescription.toLowerCase()
    );

    if (!existingTemplate) {
      // CASO 1: Nueva regla (descripción no existe)
      return await this.handleNewRule(rule, domainInfo, result);
    }

    // CASO 2: Regla existente - verificar si hay cambios
    if (rule.expression !== existingTemplate.expression || rule.action !== existingTemplate.action) {
      return await this.handleChangedRule(rule, existingTemplate, domainInfo, result);
    }

    // CASO 3: Regla idéntica
    return await this.handleIdenticalRule(rule, existingTemplate, domainInfo, result);
  }

  /**
   * Sincronizar una regla individual solo para determinar el estado de la plantilla (sin crear mappings)
   * Versión usada en el procesamiento por grupos
   */
  private async syncSingleRuleForTemplate(
    rule: CloudflareRule,
    domainInfo: DomainInfo,
    result: SyncResult
  ): Promise<{
    syncCase: 'new' | 'newer' | 'older' | 'identical';
    templateId: string;
    friendlyId: string;
    version: string;
    isOutdated: boolean;
  }> {
    const ruleDescription = rule.description || '';

    console.log(`[TemplateSynchronizer] Processing rule for template: "${ruleDescription}"`);

    // Buscar plantilla existente por comparación directa de descripción (case insensitive)
    const existingTemplate = this.templatesCache.templates.find(template =>
      template.name.toLowerCase() === ruleDescription.toLowerCase()
    );

    if (!existingTemplate) {
      // CASO 1: Nueva regla (descripción no existe)
      return await this.handleNewRuleForTemplate(rule, domainInfo, result);
    }

    // CASO 2: Regla existente - verificar si hay cambios
    if (rule.expression !== existingTemplate.expression || rule.action !== existingTemplate.action) {
      return await this.handleChangedRuleForTemplate(rule, existingTemplate, domainInfo, result);
    }

    // CASO 3: Regla idéntica
    return await this.handleIdenticalRuleForTemplate(rule, existingTemplate, domainInfo, result);
  }

  /**
   * CASO 1: Crear nueva plantilla con versión 1.0
   */
  private async handleNewRule(
    rule: CloudflareRule,
    domainInfo: DomainInfo,
    result: SyncResult
  ): Promise<{
    syncCase: 'new';
    templateId: string;
    friendlyId: string;
    version: string;
    isOutdated: boolean;
  }> {
    console.log(`[TemplateSynchronizer] CASE 1: Creating new template for "${rule.description}"`);

    const friendlyId = generateNextFriendlyId(this.templatesCache.templates);

    const newTemplate: RuleTemplate = {
      id: `auto-template-${friendlyId}-${Date.now()}`,
      friendlyId,
      name: rule.description || `Rule ${friendlyId}`,
      description: `Auto-created from domain: ${domainInfo.name}`,
      version: '1.0',
      expression: rule.expression || '',
      action: (rule.action as any) || 'block',
      actionParameters: rule.action_parameters || {},
      enabled: rule.enabled !== false,
      priority: this.templatesCache.templates.length + 1,
      tags: ['auto-created'],
      applicableTags: [],
      excludedDomains: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.templatesCache.templates.push(newTemplate);
    result.newTemplates.push(newTemplate);

    // Accumulate template for batch writing
    this.pendingChanges.templates.push(newTemplate);

    // Accumulate mapping para este dominio for batch writing
    const newMapping: TemplateRuleMapping = {
      cloudflareRuleId: rule.id,
      templateId: newTemplate.id,
      friendlyId: newTemplate.friendlyId,
      version: newTemplate.version,
      appliedAt: new Date().toISOString(),
      zoneId: domainInfo.zoneId,
      domainName: domainInfo.name
    };
    this.pendingChanges.ruleMappings.push(newMapping);

    console.log(`[TemplateSynchronizer] ✅ Created new template ${friendlyId} v${newTemplate.version}`);

    return {
      syncCase: 'new',
      templateId: newTemplate.id,
      friendlyId: newTemplate.friendlyId,
      version: newTemplate.version,
      isOutdated: false
    };
  }

  /**
   * CASO 2: Regla existente con cambios - comparar fechas
   */
  private async handleChangedRule(
    rule: CloudflareRule,
    existingTemplate: RuleTemplate,
    domainInfo: DomainInfo,
    result: SyncResult
  ): Promise<{
    syncCase: 'newer' | 'older';
    templateId: string;
    friendlyId: string;
    version: string;
    isOutdated: boolean;
  }> {
    console.log(`[TemplateSynchronizer] CASE 2: Changed rule detected for template ${existingTemplate.friendlyId}`);

    // Obtener fechas para comparación
    const ruleDate = new Date((rule as any).last_modified || (rule as any).modified_on || new Date());
    const templateDate = new Date(existingTemplate.updatedAt);

    console.log(`[TemplateSynchronizer] Date comparison: rule=${ruleDate.toISOString()}, template=${templateDate.toISOString()}`);

    if (ruleDate > templateDate) {
      // CASO 2.1: Regla más nueva → Actualizar plantilla
      return await this.handleNewerRule(rule, existingTemplate, domainInfo, result);
    } else {
      // CASO 2.2: Regla más vieja → Asignar versión anterior
      return await this.handleOlderRule(rule, existingTemplate, domainInfo, result);
    }
  }

  /**
   * CASO 2.1: Regla más nueva → Actualizar plantilla + propagación
   */
  private async handleNewerRule(
    rule: CloudflareRule,
    existingTemplate: RuleTemplate,
    domainInfo: DomainInfo,
    result: SyncResult
  ): Promise<{
    syncCase: 'newer';
    templateId: string;
    friendlyId: string;
    version: string;
    isOutdated: boolean;
  }> {
    console.log(`[TemplateSynchronizer] CASE 2.1: Rule is newer, updating template ${existingTemplate.friendlyId}`);

    const newVersion = incrementVersion(existingTemplate.version);

    // Actualizar plantilla
    const updatedTemplate: RuleTemplate = {
      ...existingTemplate,
      expression: rule.expression || existingTemplate.expression,
      action: (rule.action as any) || existingTemplate.action,
      actionParameters: rule.action_parameters || existingTemplate.actionParameters,
      version: newVersion,
      updatedAt: new Date().toISOString()
    };

    // Actualizar en cache
    const templateIndex = this.templatesCache.templates.findIndex(t => t.id === existingTemplate.id);
    if (templateIndex !== -1) {
      this.templatesCache.templates[templateIndex] = updatedTemplate;
    }

    result.updatedTemplates.push(updatedTemplate);

    // Accumulate template update for batch writing
    this.pendingChanges.templateUpdates.push(updatedTemplate);

    // Accumulate mapping para dominio actual con nueva versión
    const newMapping: TemplateRuleMapping = {
      cloudflareRuleId: rule.id,
      templateId: updatedTemplate.id,
      friendlyId: updatedTemplate.friendlyId,
      version: updatedTemplate.version,
      appliedAt: new Date().toISOString(),
      zoneId: domainInfo.zoneId,
      domainName: domainInfo.name
    };
    this.pendingChanges.ruleMappings.push(newMapping);

    // PROPAGACIÓN: Will be handled by BatchCacheWriter after all domains are processed
    // to avoid file write conflicts during concurrent processing

    console.log(`[TemplateSynchronizer] ✅ Updated template ${existingTemplate.friendlyId}: ${existingTemplate.version} → ${newVersion}`);
    console.log(`[TemplateSynchronizer] 🔄 Template changes will be propagated via batch processing`);

    return {
      syncCase: 'newer',
      templateId: updatedTemplate.id,
      friendlyId: updatedTemplate.friendlyId,
      version: updatedTemplate.version,
      isOutdated: false
    };
  }

  /**
   * CASO 2.2: Regla más vieja → Asignar versión anterior
   */
  private async handleOlderRule(
    rule: CloudflareRule,
    existingTemplate: RuleTemplate,
    domainInfo: DomainInfo,
    result: SyncResult
  ): Promise<{
    syncCase: 'older';
    templateId: string;
    friendlyId: string;
    version: string;
    isOutdated: boolean;
  }> {
    console.log(`[TemplateSynchronizer] CASE 2.2: Rule is older, assigning previous version`);

    const olderVersion = decrementVersion(existingTemplate.version);

    // Accumulate mapping con versión anterior (marca como desactualizado)
    const olderMapping: TemplateRuleMapping = {
      cloudflareRuleId: rule.id,
      templateId: existingTemplate.id,
      friendlyId: existingTemplate.friendlyId,
      version: olderVersion,
      appliedAt: new Date().toISOString(),
      zoneId: domainInfo.zoneId,
      domainName: domainInfo.name
    };
    this.pendingChanges.ruleMappings.push(olderMapping);

    console.log(`[TemplateSynchronizer] ✅ Assigned older version ${olderVersion} to domain ${domainInfo.name} (current template: ${existingTemplate.version})`);

    return {
      syncCase: 'older',
      templateId: existingTemplate.id,
      friendlyId: existingTemplate.friendlyId,
      version: olderVersion,
      isOutdated: true // Esta regla está usando una versión anterior, está desactualizada
    };
  }

  /**
   * CASO 3: Regla idéntica → Asignar plantilla actual
   */
  private async handleIdenticalRule(
    rule: CloudflareRule,
    existingTemplate: RuleTemplate,
    domainInfo: DomainInfo,
    result: SyncResult
  ): Promise<{
    syncCase: 'identical';
    templateId: string;
    friendlyId: string;
    version: string;
    isOutdated: boolean;
  }> {
    console.log(`[TemplateSynchronizer] CASE 3: Identical rule, assigning current template version`);

    // Accumulate mapping con versión actual
    const identicalMapping: TemplateRuleMapping = {
      cloudflareRuleId: rule.id,
      templateId: existingTemplate.id,
      friendlyId: existingTemplate.friendlyId,
      version: existingTemplate.version,
      appliedAt: new Date().toISOString(),
      zoneId: domainInfo.zoneId,
      domainName: domainInfo.name
    };
    this.pendingChanges.ruleMappings.push(identicalMapping);

    console.log(`[TemplateSynchronizer] ✅ Assigned current version ${existingTemplate.version} to domain ${domainInfo.name}`);

    return {
      syncCase: 'identical',
      templateId: existingTemplate.id,
      friendlyId: existingTemplate.friendlyId,
      version: existingTemplate.version,
      isOutdated: false
    };
  }

  /**
   * Agrupar reglas por nombre (description) para procesamiento unificado
   */
  private groupRulesByName(rules: CloudflareRule[]): Map<string, Array<{
    rule: CloudflareRule;
    lastModifiedDate: Date;
    id: string;
  }>> {
    const groups = new Map<string, Array<{
      rule: CloudflareRule;
      lastModifiedDate: Date;
      id: string;
    }>>();

    for (const rule of rules) {
      const ruleName = (rule.description || '').toLowerCase();
      if (!ruleName.trim()) continue; // Skip rules without description

      // Extract date from rule metadata
      const lastModifiedDate = new Date(
        (rule as any).last_modified ||
        (rule as any).modified_on ||
        (rule as any).created_on ||
        Date.now()
      );

      const ruleWithDate = {
        rule,
        lastModifiedDate,
        id: rule.id
      };

      if (!groups.has(ruleName)) {
        groups.set(ruleName, []);
      }
      groups.get(ruleName)!.push(ruleWithDate);
    }

    return groups;
  }

  /**
   * Encontrar la regla más nueva en un grupo basándose en fecha de modificación
   */
  private findNewestRuleInGroup(rulesGroup: Array<{
    rule: CloudflareRule;
    lastModifiedDate: Date;
    id: string;
  }>): {
    rule: CloudflareRule;
    lastModifiedDate: Date;
    id: string;
  } {
    let newestRule = rulesGroup[0];

    for (const ruleWithDate of rulesGroup) {
      if (ruleWithDate.lastModifiedDate > newestRule.lastModifiedDate) {
        newestRule = ruleWithDate;
      }
    }

    return newestRule;
  }

  /**
   * Asignar versión correcta basándose en la fecha de la regla vs la regla más nueva del grupo
   */
  private assignVersionBasedOnDate(
    ruleWithDate: { rule: CloudflareRule; lastModifiedDate: Date; id: string },
    newestRule: { rule: CloudflareRule; lastModifiedDate: Date; id: string },
    groupSyncResult: {
      syncCase: 'new' | 'newer' | 'older' | 'identical';
      templateId: string;
      friendlyId: string;
      version: string;
      isOutdated: boolean;
    },
    domainInfo: DomainInfo
  ): {
    syncCase: 'new' | 'newer' | 'older' | 'identical';
    templateId: string;
    friendlyId: string;
    version: string;
    isOutdated: boolean;
  } {
    // Si es la regla más nueva del grupo, usar el resultado del grupo directamente
    if (ruleWithDate.id === newestRule.id) {
      console.log(`[TemplateSynchronizer] Rule ${ruleWithDate.id} is the newest in group - using group result`);

      // Crear mapping para la regla más nueva
      const mapping: TemplateRuleMapping = {
        cloudflareRuleId: ruleWithDate.rule.id,
        templateId: groupSyncResult.templateId,
        friendlyId: groupSyncResult.friendlyId,
        version: groupSyncResult.version,
        appliedAt: new Date().toISOString(),
        zoneId: domainInfo.zoneId,
        domainName: domainInfo.name
      };
      this.pendingChanges.ruleMappings.push(mapping);

      return groupSyncResult;
    }

    // Si no es la más nueva, asignar una versión anterior
    console.log(`[TemplateSynchronizer] Rule ${ruleWithDate.id} is older than newest in group - assigning older version`);

    const olderVersion = decrementVersion(groupSyncResult.version);

    // Crear mapping con versión anterior
    const olderMapping: TemplateRuleMapping = {
      cloudflareRuleId: ruleWithDate.rule.id,
      templateId: groupSyncResult.templateId,
      friendlyId: groupSyncResult.friendlyId,
      version: olderVersion,
      appliedAt: new Date().toISOString(),
      zoneId: domainInfo.zoneId,
      domainName: domainInfo.name
    };
    this.pendingChanges.ruleMappings.push(olderMapping);

    return {
      syncCase: 'older',
      templateId: groupSyncResult.templateId,
      friendlyId: groupSyncResult.friendlyId,
      version: olderVersion,
      isOutdated: true
    };
  }

  /**
   * CASO 1: Crear nueva plantilla con versión 1.0 (sin crear mapping)
   */
  private async handleNewRuleForTemplate(
    rule: CloudflareRule,
    domainInfo: DomainInfo,
    result: SyncResult
  ): Promise<{
    syncCase: 'new';
    templateId: string;
    friendlyId: string;
    version: string;
    isOutdated: boolean;
  }> {
    console.log(`[TemplateSynchronizer] CASE 1 (Template): Creating new template for "${rule.description}"`);

    const friendlyId = generateNextFriendlyId(this.templatesCache.templates);

    const newTemplate: RuleTemplate = {
      id: `auto-template-${friendlyId}-${Date.now()}`,
      friendlyId,
      name: rule.description || `Rule ${friendlyId}`,
      description: `Auto-created from domain: ${domainInfo.name}`,
      version: '1.0',
      expression: rule.expression || '',
      action: (rule.action as any) || 'block',
      actionParameters: rule.action_parameters || {},
      enabled: rule.enabled !== false,
      priority: this.templatesCache.templates.length + 1,
      tags: ['auto-created'],
      applicableTags: [],
      excludedDomains: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.templatesCache.templates.push(newTemplate);
    result.newTemplates.push(newTemplate);

    // Accumulate template for batch writing
    this.pendingChanges.templates.push(newTemplate);

    console.log(`[TemplateSynchronizer] ✅ Created new template ${friendlyId} v${newTemplate.version} (no mapping created)`);

    return {
      syncCase: 'new',
      templateId: newTemplate.id,
      friendlyId: newTemplate.friendlyId,
      version: newTemplate.version,
      isOutdated: false
    };
  }

  /**
   * CASO 2: Regla existente con cambios - comparar fechas (sin crear mapping)
   */
  private async handleChangedRuleForTemplate(
    rule: CloudflareRule,
    existingTemplate: RuleTemplate,
    domainInfo: DomainInfo,
    result: SyncResult
  ): Promise<{
    syncCase: 'newer' | 'older';
    templateId: string;
    friendlyId: string;
    version: string;
    isOutdated: boolean;
  }> {
    console.log(`[TemplateSynchronizer] CASE 2 (Template): Changed rule detected for template ${existingTemplate.friendlyId}`);

    // Obtener fechas para comparación
    const ruleDate = new Date((rule as any).last_modified || (rule as any).modified_on || new Date());
    const templateDate = new Date(existingTemplate.updatedAt);

    console.log(`[TemplateSynchronizer] Date comparison: rule=${ruleDate.toISOString()}, template=${templateDate.toISOString()}`);

    if (ruleDate > templateDate) {
      // CASO 2.1: Regla más nueva → Actualizar plantilla
      return await this.handleNewerRuleForTemplate(rule, existingTemplate, domainInfo, result);
    } else {
      // CASO 2.2: Regla más vieja → Asignar versión anterior
      return await this.handleOlderRuleForTemplate(rule, existingTemplate, domainInfo, result);
    }
  }

  /**
   * CASO 2.1: Regla más nueva → Actualizar plantilla + propagación (sin crear mapping)
   */
  private async handleNewerRuleForTemplate(
    rule: CloudflareRule,
    existingTemplate: RuleTemplate,
    domainInfo: DomainInfo,
    result: SyncResult
  ): Promise<{
    syncCase: 'newer';
    templateId: string;
    friendlyId: string;
    version: string;
    isOutdated: boolean;
  }> {
    console.log(`[TemplateSynchronizer] CASE 2.1 (Template): Rule is newer, updating template ${existingTemplate.friendlyId}`);

    const newVersion = incrementVersion(existingTemplate.version);

    // Actualizar plantilla
    const updatedTemplate: RuleTemplate = {
      ...existingTemplate,
      expression: rule.expression || existingTemplate.expression,
      action: (rule.action as any) || existingTemplate.action,
      actionParameters: rule.action_parameters || existingTemplate.actionParameters,
      version: newVersion,
      updatedAt: new Date().toISOString()
    };

    // Actualizar en cache
    const templateIndex = this.templatesCache.templates.findIndex(t => t.id === existingTemplate.id);
    if (templateIndex !== -1) {
      this.templatesCache.templates[templateIndex] = updatedTemplate;
    }

    result.updatedTemplates.push(updatedTemplate);

    // Accumulate template update for batch writing
    this.pendingChanges.templateUpdates.push(updatedTemplate);

    console.log(`[TemplateSynchronizer] ✅ Updated template ${existingTemplate.friendlyId}: ${existingTemplate.version} → ${newVersion} (no mapping created)`);

    return {
      syncCase: 'newer',
      templateId: updatedTemplate.id,
      friendlyId: updatedTemplate.friendlyId,
      version: updatedTemplate.version,
      isOutdated: false
    };
  }

  /**
   * CASO 2.2: Regla más vieja → Asignar versión anterior (sin crear mapping)
   */
  private async handleOlderRuleForTemplate(
    rule: CloudflareRule,
    existingTemplate: RuleTemplate,
    domainInfo: DomainInfo,
    result: SyncResult
  ): Promise<{
    syncCase: 'older';
    templateId: string;
    friendlyId: string;
    version: string;
    isOutdated: boolean;
  }> {
    console.log(`[TemplateSynchronizer] CASE 2.2 (Template): Rule is older, will assign previous version (no mapping created)`);

    const olderVersion = decrementVersion(existingTemplate.version);

    console.log(`[TemplateSynchronizer] ✅ Determined older version ${olderVersion} for template ${existingTemplate.friendlyId} (no mapping created)`);

    return {
      syncCase: 'older',
      templateId: existingTemplate.id,
      friendlyId: existingTemplate.friendlyId,
      version: olderVersion,
      isOutdated: true
    };
  }

  /**
   * CASO 3: Regla idéntica → Asignar plantilla actual (sin crear mapping)
   */
  private async handleIdenticalRuleForTemplate(
    rule: CloudflareRule,
    existingTemplate: RuleTemplate,
    domainInfo: DomainInfo,
    result: SyncResult
  ): Promise<{
    syncCase: 'identical';
    templateId: string;
    friendlyId: string;
    version: string;
    isOutdated: boolean;
  }> {
    console.log(`[TemplateSynchronizer] CASE 3 (Template): Identical rule, will assign current template version (no mapping created)`);

    console.log(`[TemplateSynchronizer] ✅ Using current version ${existingTemplate.version} for template ${existingTemplate.friendlyId} (no mapping created)`);

    return {
      syncCase: 'identical',
      templateId: existingTemplate.id,
      friendlyId: existingTemplate.friendlyId,
      version: existingTemplate.version,
      isOutdated: false
    };
  }

  /**
   * Note: Propagation of template changes to other domains is now handled
   * by the BatchCacheWriter to avoid concurrent file access issues.
   */

  /**
   * Sincronización global de múltiples dominios
   * Procesa todas las reglas de todos los dominios de una vez para evitar actualizaciones duplicadas
   */
  async syncRulesGlobally(
    domainRulesMap: Map<string, { rules: CloudflareRule[]; domainInfo: DomainInfo }>
  ): Promise<Map<string, SyncResult>> {
    console.log(`[TemplateSynchronizer] Starting GLOBAL sync for ${domainRulesMap.size} domains`);

    await this.loadTemplatesCache();
    this.resetPendingChanges();

    // FASE 1: Recopilar todas las reglas de todos los dominios
    const allRulesWithDomain: Array<{
      rule: CloudflareRule;
      domainInfo: DomainInfo;
      lastModifiedDate: Date;
    }> = [];

    for (const [zoneId, { rules, domainInfo }] of domainRulesMap) {
      for (const rule of rules) {
        const lastModifiedDate = new Date(
          (rule as any).last_modified ||
          (rule as any).modified_on ||
          (rule as any).created_on ||
          Date.now()
        );

        allRulesWithDomain.push({
          rule,
          domainInfo,
          lastModifiedDate
        });
      }
    }

    console.log(`[TemplateSynchronizer] Collected ${allRulesWithDomain.length} total rules from ${domainRulesMap.size} domains`);

    // FASE 2: Agrupar por nombre a nivel global
    const globalRuleGroups = this.groupRulesGlobally(allRulesWithDomain);
    console.log(`[TemplateSynchronizer] Grouped into ${globalRuleGroups.size} unique rule names globally`);

    // FASE 3: Procesar plantillas una sola vez por grupo
    const templateResults = new Map<string, {
      templateId: string;
      friendlyId: string;
      version: string;
      syncCase: 'new' | 'newer' | 'older' | 'identical';
    }>();

    for (const [ruleName, ruleGroup] of globalRuleGroups) {
      try {
        console.log(`[TemplateSynchronizer] Processing global group "${ruleName}" with ${ruleGroup.length} rules from multiple domains`);

        // Encontrar la regla más nueva globalmente
        const newestRule = this.findNewestRuleGlobally(ruleGroup);
        console.log(`[TemplateSynchronizer] Newest rule globally: ${newestRule.rule.id} from ${newestRule.domainInfo.name} (${newestRule.lastModifiedDate.toISOString()})`);

        // Procesar plantilla una sola vez
        const dummyResult: SyncResult = {
          newTemplates: [],
          updatedTemplates: [],
          processedRules: [],
          propagatedDomains: [],
          pendingChanges: this.pendingChanges
        };

        const templateResult = await this.syncSingleRuleForTemplate(newestRule.rule, newestRule.domainInfo, dummyResult);
        templateResults.set(ruleName, templateResult);

        console.log(`[TemplateSynchronizer] Template processed: ${templateResult.friendlyId} v${templateResult.version} (case: ${templateResult.syncCase})`);

      } catch (error) {
        console.error(`[TemplateSynchronizer] Error processing global group "${ruleName}":`, error);
      }
    }

    // FASE 4: Asignar versiones a cada dominio basándose en los resultados de plantillas
    const domainResults = new Map<string, SyncResult>();

    for (const [zoneId, { domainInfo }] of domainRulesMap) {
      const result: SyncResult = {
        newTemplates: [],
        updatedTemplates: [],
        processedRules: [],
        propagatedDomains: [],
        pendingChanges: { ruleMappings: [], templates: [], removedMappings: [], templateUpdates: [] }
      };

      domainResults.set(zoneId, result);
    }

    // Asignar reglas a dominios con versiones correctas
    for (const [ruleName, ruleGroup] of globalRuleGroups) {
      const templateResult = templateResults.get(ruleName);
      if (!templateResult) continue;

      const newestRule = this.findNewestRuleGlobally(ruleGroup);

      for (const ruleWithDomain of ruleGroup) {
        const domainResult = domainResults.get(ruleWithDomain.domainInfo.zoneId);
        if (!domainResult) continue;

        // Determinar versión basándose en si es la regla más nueva o no
        let assignedVersion = templateResult.version;
        let isOutdated = false;
        let syncCase = templateResult.syncCase;

        // FIXED: Mejorar detección para reglas con misma fecha (aplicadas al mismo tiempo)
        const timeDifference = Math.abs(ruleWithDomain.lastModifiedDate.getTime() - newestRule.lastModifiedDate.getTime());
        const isWithinSameTimeWindow = timeDifference < 60000; // Dentro de 1 minuto = mismo tiempo

        if (ruleWithDomain.rule.id !== newestRule.rule.id && !isWithinSameTimeWindow) {
          // Solo marcar como older si realmente es más vieja (no aplicada al mismo tiempo)
          assignedVersion = decrementVersion(templateResult.version);
          isOutdated = true;
          syncCase = 'older';
        } else if (isWithinSameTimeWindow) {
          // Si fue aplicada al mismo tiempo, considerar como actualizada
          console.log(`[TemplateSynchronizer] Rule ${ruleWithDomain.rule.id} applied at same time as newest, keeping as current version`);
        }

        // Crear mapping
        const mapping: TemplateRuleMapping = {
          cloudflareRuleId: ruleWithDomain.rule.id,
          templateId: templateResult.templateId,
          friendlyId: templateResult.friendlyId,
          version: assignedVersion,
          appliedAt: new Date().toISOString(),
          zoneId: ruleWithDomain.domainInfo.zoneId,
          domainName: ruleWithDomain.domainInfo.name
        };
        this.pendingChanges.ruleMappings.push(mapping);

        // Agregar a resultado del dominio
        domainResult.processedRules.push({
          ruleId: ruleWithDomain.rule.id,
          templateId: templateResult.templateId,
          friendlyId: templateResult.friendlyId,
          version: assignedVersion,
          isOutdated,
          syncCase
        });

        console.log(`[TemplateSynchronizer] Assigned ${templateResult.friendlyId} v${assignedVersion} to ${ruleWithDomain.domainInfo.name} (outdated: ${isOutdated})`);
      }
    }

    // Compartir nuevas plantillas y actualizaciones entre todos los resultados
    for (const result of domainResults.values()) {
      result.newTemplates = [...this.pendingChanges.templates];
      result.updatedTemplates = [...this.pendingChanges.templateUpdates];
      result.pendingChanges = this.pendingChanges;
    }

    console.log(`[TemplateSynchronizer] ✅ Global sync completed. Created ${this.pendingChanges.templates.length} new templates, updated ${this.pendingChanges.templateUpdates.length} templates`);

    return domainResults;
  }

  /**
   * Agrupar reglas por nombre a nivel global (de todos los dominios)
   */
  private groupRulesGlobally(rulesWithDomain: Array<{
    rule: CloudflareRule;
    domainInfo: DomainInfo;
    lastModifiedDate: Date;
  }>): Map<string, Array<{
    rule: CloudflareRule;
    domainInfo: DomainInfo;
    lastModifiedDate: Date;
  }>> {
    const groups = new Map<string, Array<{
      rule: CloudflareRule;
      domainInfo: DomainInfo;
      lastModifiedDate: Date;
    }>>();

    for (const ruleWithDomain of rulesWithDomain) {
      const ruleName = (ruleWithDomain.rule.description || '').toLowerCase();
      if (!ruleName.trim()) continue;

      if (!groups.has(ruleName)) {
        groups.set(ruleName, []);
      }
      groups.get(ruleName)!.push(ruleWithDomain);
    }

    return groups;
  }

  /**
   * Encontrar la regla más nueva globalmente en un grupo
   */
  private findNewestRuleGlobally(ruleGroup: Array<{
    rule: CloudflareRule;
    domainInfo: DomainInfo;
    lastModifiedDate: Date;
  }>): {
    rule: CloudflareRule;
    domainInfo: DomainInfo;
    lastModifiedDate: Date;
  } {
    let newestRule = ruleGroup[0];

    for (const ruleWithDomain of ruleGroup) {
      if (ruleWithDomain.lastModifiedDate > newestRule.lastModifiedDate) {
        newestRule = ruleWithDomain;
      }
    }

    return newestRule;
  }

  /**
   * Obtener estadísticas de sincronización
   */
  async getSyncStats(): Promise<{
    totalTemplates: number;
    autoCreatedTemplates: number;
    lastSync: string;
  }> {
    await this.loadTemplatesCache();

    return {
      totalTemplates: this.templatesCache.templates.length,
      autoCreatedTemplates: this.templatesCache.templates.filter(t => t.tags.includes('auto-created')).length,
      lastSync: this.templatesCache.lastUpdated
    };
  }
}