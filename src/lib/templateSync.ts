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
import { addRuleMapping, removeRuleMapping } from './ruleMapping';

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
  propagatedDomains: string[];
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
   * Guardar plantillas al cache
   */
  private async saveTemplatesCache(): Promise<void> {
    this.templatesCache.lastUpdated = new Date().toISOString();
    await safeWriteJsonFile(RULES_TEMPLATES_FILE, this.templatesCache);
  }

  /**
   * Sincronizar reglas para un dominio específico
   * Implementa los 3 casos de sincronización según especificación
   */
  async syncRulesForDomain(
    rules: CloudflareRule[],
    domainInfo: DomainInfo
  ): Promise<SyncResult> {
    console.log(`[TemplateSynchronizer] Starting sync for domain ${domainInfo.name} with ${rules.length} rules`);

    await this.loadTemplatesCache();

    const result: SyncResult = {
      newTemplates: [],
      updatedTemplates: [],
      processedRules: [],
      propagatedDomains: []
    };

    for (const rule of rules) {
      try {
        const syncCase = await this.syncSingleRule(rule, domainInfo, result);

        result.processedRules.push({
          ruleId: rule.id,
          templateId: '', // Se llenará en syncSingleRule
          friendlyId: '', // Se llenará en syncSingleRule
          version: '', // Se llenará en syncSingleRule
          isOutdated: false, // Se llenará en syncSingleRule
          syncCase
        });

      } catch (error) {
        console.error(`[TemplateSynchronizer] Error processing rule ${rule.id}:`, error);
      }
    }

    // Guardar cambios si hay templates nuevos o actualizados
    if (result.newTemplates.length > 0 || result.updatedTemplates.length > 0) {
      await this.saveTemplatesCache();
      console.log(`[TemplateSynchronizer] Saved ${result.newTemplates.length} new and ${result.updatedTemplates.length} updated templates`);
    }

    return result;
  }

  /**
   * Sincronizar una regla individual según especificación
   */
  private async syncSingleRule(
    rule: CloudflareRule,
    domainInfo: DomainInfo,
    result: SyncResult
  ): Promise<'new' | 'newer' | 'older' | 'identical'> {
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
   * CASO 1: Crear nueva plantilla con versión 1.0
   */
  private async handleNewRule(
    rule: CloudflareRule,
    domainInfo: DomainInfo,
    result: SyncResult
  ): Promise<'new'> {
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

    // Crear mapping para este dominio
    await addRuleMapping({
      cloudflareRuleId: rule.id,
      templateId: newTemplate.id,
      friendlyId: newTemplate.friendlyId,
      version: newTemplate.version,
      appliedAt: new Date().toISOString(),
      zoneId: domainInfo.zoneId,
      domainName: domainInfo.name
    });

    console.log(`[TemplateSynchronizer] ✅ Created new template ${friendlyId} v${newTemplate.version}`);
    return 'new';
  }

  /**
   * CASO 2: Regla existente con cambios - comparar fechas
   */
  private async handleChangedRule(
    rule: CloudflareRule,
    existingTemplate: RuleTemplate,
    domainInfo: DomainInfo,
    result: SyncResult
  ): Promise<'newer' | 'older'> {
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
  ): Promise<'newer'> {
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

    // Crear mapping para dominio actual con nueva versión
    await addRuleMapping({
      cloudflareRuleId: rule.id,
      templateId: updatedTemplate.id,
      friendlyId: updatedTemplate.friendlyId,
      version: updatedTemplate.version,
      appliedAt: new Date().toISOString(),
      zoneId: domainInfo.zoneId,
      domainName: domainInfo.name
    });

    // PROPAGACIÓN: Marcar otros dominios como desactualizados
    const propagatedDomains = await this.markOtherDomainsAsOutdated(
      updatedTemplate.id,
      newVersion,
      domainInfo.zoneId
    );

    result.propagatedDomains.push(...propagatedDomains);

    console.log(`[TemplateSynchronizer] ✅ Updated template ${existingTemplate.friendlyId}: ${existingTemplate.version} → ${newVersion}`);
    console.log(`[TemplateSynchronizer] 🔄 Propagated changes to ${propagatedDomains.length} other domains`);

    return 'newer';
  }

  /**
   * CASO 2.2: Regla más vieja → Asignar versión anterior
   */
  private async handleOlderRule(
    rule: CloudflareRule,
    existingTemplate: RuleTemplate,
    domainInfo: DomainInfo,
    result: SyncResult
  ): Promise<'older'> {
    console.log(`[TemplateSynchronizer] CASE 2.2: Rule is older, assigning previous version`);

    const olderVersion = decrementVersion(existingTemplate.version);

    // Crear mapping con versión anterior (marca como desactualizado)
    await addRuleMapping({
      cloudflareRuleId: rule.id,
      templateId: existingTemplate.id,
      friendlyId: existingTemplate.friendlyId,
      version: olderVersion,
      appliedAt: new Date().toISOString(),
      zoneId: domainInfo.zoneId,
      domainName: domainInfo.name
    });

    console.log(`[TemplateSynchronizer] ✅ Assigned older version ${olderVersion} to domain ${domainInfo.name} (current template: ${existingTemplate.version})`);

    return 'older';
  }

  /**
   * CASO 3: Regla idéntica → Asignar plantilla actual
   */
  private async handleIdenticalRule(
    rule: CloudflareRule,
    existingTemplate: RuleTemplate,
    domainInfo: DomainInfo,
    result: SyncResult
  ): Promise<'identical'> {
    console.log(`[TemplateSynchronizer] CASE 3: Identical rule, assigning current template version`);

    // Crear mapping con versión actual
    await addRuleMapping({
      cloudflareRuleId: rule.id,
      templateId: existingTemplate.id,
      friendlyId: existingTemplate.friendlyId,
      version: existingTemplate.version,
      appliedAt: new Date().toISOString(),
      zoneId: domainInfo.zoneId,
      domainName: domainInfo.name
    });

    console.log(`[TemplateSynchronizer] ✅ Assigned current version ${existingTemplate.version} to domain ${domainInfo.name}`);

    return 'identical';
  }

  /**
   * Marcar otros dominios como desactualizados cuando una plantilla se actualiza
   */
  private async markOtherDomainsAsOutdated(
    templateId: string,
    newVersion: string,
    excludeZoneId: string
  ): Promise<string[]> {
    try {
      const { markOtherDomainsAsOutdated } = await import('./ruleMapping');
      return await markOtherDomainsAsOutdated(templateId, newVersion, excludeZoneId);
    } catch (error) {
      console.error(`[TemplateSynchronizer] Error marking other domains as outdated:`, error);
      return [];
    }
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