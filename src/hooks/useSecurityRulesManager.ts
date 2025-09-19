'use client';

import { useState, useEffect, useCallback } from 'react';
import { RuleTemplate } from '@/types/cloudflare';
import { tokenStorage } from '@/lib/tokenStorage';
import { useNotifications } from './useNotifications';
import { BulkUpdatePreviewModal } from '@/components/BulkUpdatePreviewModal';
import { findOutdatedDomains, updateRuleInDomains, AffectedDomain } from '@/lib/ruleUpdater';

export function useSecurityRulesManager() {
  const [templates, setTemplates] = useState<RuleTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<RuleTemplate | null>(null);
  const [updatingTemplate, setUpdatingTemplate] = useState<string | null>(null);
  const [ruleUsageStats, setRuleUsageStats] = useState<Map<string, { domainCount: number; domains: string[] }>>(new Map());
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewData, setPreviewData] = useState<{
    template: RuleTemplate;
    domains: Array<{
      zoneId: string;
      domain: string;
      currentVersion?: string;
      action: 'update' | 'add' | 'skip';
      reason?: string;
    }>;
  } | null>(null);

  // New state for rule update confirmation
  const [showUpdateConfirmation, setShowUpdateConfirmation] = useState(false);
  const [updateConfirmationData, setUpdateConfirmationData] = useState<{
    template: RuleTemplate;
    affectedDomains: AffectedDomain[];
  } | null>(null);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateProgressCallback, setUpdateProgressCallback] = useState<((progress: number) => void) | null>(null);

  const notifications = useNotifications();

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    expression: '',
    action: 'block' as RuleTemplate['action'],
    tags: [] as string[],
    applicableTags: [] as string[],
    excludedDomains: [] as string[]
  });

  const loadRuleUsageStats = useCallback(async () => {
    try {
      const { useDomainStore } = await import('@/store/domainStore');
      const storeData = useDomainStore.getState().allDomains;

      if (storeData && storeData.length > 0) {
        const { getRuleUsageStats } = await import('@/lib/ruleUpdater');
        const stats = await getRuleUsageStats(storeData);
        setRuleUsageStats(stats);
      }
    } catch (error) {
      console.warn('Error loading rule usage stats:', error);
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/security-rules');
      const result = await response.json();

      if (result.success) {
        setTemplates(result.data.templates);
        // Load usage stats after templates are loaded
        await loadRuleUsageStats();
      } else {
        notifications.error('Error al cargar plantillas de reglas');
      }
    } catch (error) {
      console.error('Error loading templates:', error);
      notifications.error('Error al cargar plantillas de reglas');
    } finally {
      setLoading(false);
    }
  }, [notifications, loadRuleUsageStats]);

  const createTemplate = useCallback(async () => {
    try {
      const response = await fetch('/api/security-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const result = await response.json();

      if (result.success) {
        setTemplates(prev => [...prev, result.data]);
        setShowCreateDialog(false);
        resetForm();
        notifications.success('Plantilla creada exitosamente');
      } else {
        notifications.error(result.error || 'Error al crear plantilla');
      }
    } catch (error) {
      console.error('Error creating template:', error);
      notifications.error('Error al crear plantilla');
    }
  }, [formData, notifications]);

  const updateTemplate = useCallback(async () => {
    if (!editingTemplate) return;

    try {
      const oldTemplate = editingTemplate;
      const hasSignificantChanges =
        formData.expression !== oldTemplate.expression ||
        formData.action !== oldTemplate.action;

      const response = await fetch(`/api/security-rules/${editingTemplate.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const result = await response.json();

      if (result.success) {
        const updatedTemplate = result.data;
        setTemplates(prev => prev.map(t => t.id === editingTemplate.id ? updatedTemplate : t));

        // If version changed, check for affected domains using CURRENT cache data
        if (result.versionChanged) {
          console.log('[SecurityRulesManager] Version changed, checking affected domains using existing cache');

          // Find affected domains using store data ONLY (no API fallback)
          try {
            const { useDomainStore } = await import('@/store/domainStore');
            const storeData = useDomainStore.getState().allDomains;

            if (storeData && storeData.length > 0) {
              const affectedDomains = await findOutdatedDomains(updatedTemplate, storeData);

              if (affectedDomains.length > 0) {
                console.log(`[SecurityRulesManager] Found ${affectedDomains.length} domains that need updating`);
                // Show confirmation modal
                setUpdateConfirmationData({
                  template: updatedTemplate,
                  affectedDomains
                });
                setShowUpdateConfirmation(true);
              } else {
                console.log('[SecurityRulesManager] No domains need updating for this template');
              }
            } else {
              console.warn('[SecurityRulesManager] No domain data available in store - user needs to refresh domains first');
            }
          } catch (error) {
            console.warn('[SecurityRulesManager] Failed to check affected domains:', error);
          }
        }

        setShowEditDialog(false);
        setEditingTemplate(null);
        resetForm();
        notifications.success('Plantilla actualizada exitosamente');
      } else {
        notifications.error(result.error || 'Error al actualizar plantilla');
      }
    } catch (error) {
      console.error('Error updating template:', error);
      notifications.error('Error al actualizar plantilla');
    }
  }, [formData, editingTemplate, notifications]);

  const deleteTemplate = useCallback(async (templateId: string) => {
    try {
      // Find the template to get its friendlyId
      const template = templates.find(t => t.id === templateId);
      if (!template) {
        notifications.error('Plantilla no encontrada');
        return;
      }

      // Check if rule is in use using store data
      const { useDomainStore } = await import('@/store/domainStore');
      const storeData = useDomainStore.getState().allDomains;

      if (storeData && storeData.length > 0) {
        const { isRuleInUse } = await import('@/lib/ruleUpdater');
        const usage = await isRuleInUse(template.friendlyId, storeData);

        if (usage.inUse) {
          const domainList = usage.domains.slice(0, 5).join(', ');
          const moreText = usage.domainCount > 5 ? ` y ${usage.domainCount - 5} más` : '';

          notifications.error(
            `No se puede eliminar la regla ${template.friendlyId}. ` +
            `Está siendo usada por ${usage.domainCount} dominio(s): ${domainList}${moreText}. ` +
            `Elimina la regla de todos los dominios primero.`
          );
          return;
        }
      }

      if (!confirm('¿Estás seguro de que quieres eliminar esta plantilla?')) {
        return;
      }

      const response = await fetch(`/api/security-rules/${templateId}`, {
        method: 'DELETE'
      });

      const result = await response.json();

      if (result.success) {
        setTemplates(prev => prev.filter(t => t.id !== templateId));
        notifications.success('Plantilla eliminada exitosamente');
      } else {
        notifications.error(result.error || 'Error al eliminar plantilla');
      }
    } catch (error) {
      console.error('Error deleting template:', error);
      notifications.error('Error al eliminar plantilla');
    }
  }, [templates, notifications]);

  const handleEditTemplate = useCallback((template: RuleTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      description: template.description,
      expression: template.expression,
      action: template.action,
      tags: template.tags,
      applicableTags: template.applicableTags || [],
      excludedDomains: template.excludedDomains || []
    });
    setShowEditDialog(true);
  }, []);

  const getBulkUpdatePreview = useCallback(async (template: RuleTemplate) => {
    const apiToken = tokenStorage.getToken();
    if (!apiToken) {
      notifications.error('API Token no encontrado.');
      return;
    }

    try {
      const analyzeResponse = await fetch('/api/security-rules/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-token': apiToken // Also send in header for consistency
        },
        body: JSON.stringify({ apiToken, forceRefresh: false })
      });

      if (!analyzeResponse.ok) throw new Error('Failed to analyze domains');

      const analyzeResult = await analyzeResponse.json();
      if (!analyzeResult.success) throw new Error(analyzeResult.error);

      const previewDomains = analyzeResult.data.domains.map((domainStatus: any) => {
        let action: 'update' | 'add' | 'skip' = 'skip';
        let reason = '';
        let currentVersion = '';

        if (domainStatus.ruleStatus && domainStatus.ruleStatus.appliedRules) {
          const existingRule = domainStatus.ruleStatus.appliedRules.find((rule: any) =>
            rule.friendlyId === template.friendlyId
          );

          if (existingRule) {
            currentVersion = existingRule.version || '';
            const versionComparison = parseFloat(existingRule.version) - parseFloat(template.version);

            if (versionComparison < 0) {
              action = 'update';
              reason = `v${existingRule.version} → v${template.version}`;
            } else if (versionComparison === 0) {
              action = 'skip';
              reason = 'Versión actual';
            } else {
              action = 'skip';
              reason = 'Versión más nueva';
            }
          } else {
            action = 'add';
            reason = 'Nueva regla';
          }
        } else {
          action = 'add';
          reason = 'Nueva regla';
        }

        return {
          zoneId: domainStatus.zoneId,
          domain: domainStatus.domain,
          currentVersion: currentVersion || undefined,
          action,
          reason
        };
      });

      setPreviewData({
        template,
        domains: previewDomains
      });
      setShowPreviewModal(true);

    } catch (error) {
      console.error('Error getting bulk update preview:', error);
      notifications.error('Error al obtener preview de actualización');
    }
  }, [notifications]);

  const executeBulkUpdate = useCallback(async () => {
    if (!previewData) return;

    const { template, domains } = previewData;
    const domainsToUpdate = domains.filter(d => d.action === 'update' || d.action === 'add');

    if (domainsToUpdate.length === 0) {
      notifications.info('No hay dominios para actualizar');
      setShowPreviewModal(false);
      return;
    }

    const apiToken = tokenStorage.getToken();
    if (!apiToken) {
      notifications.error('API Token no encontrado.');
      return;
    }

    try {
      setUpdatingTemplate(template.id);
      setShowPreviewModal(false);

      const updateResponse = await fetch('/api/domains/rules/bulk-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-token': apiToken
        },
        body: JSON.stringify({
          action: 'add',
          selectedRules: [template.friendlyId],
          targetZoneIds: domainsToUpdate.map(d => d.zoneId),
          preview: false
        })
      });

      const updateResult = await updateResponse.json();
      if (updateResult.success) {
        const { summary } = updateResult.data;
        notifications.success(`Regla actualizada en ${summary.successful}/${summary.total} dominios`);
      } else {
        notifications.error('Error al actualizar dominios');
      }

    } catch (error) {
      console.error('Error executing bulk update:', error);
      notifications.error('Error al actualizar regla en todos los dominios');
    } finally {
      setUpdatingTemplate(null);
      setPreviewData(null);
    }
  }, [previewData, notifications]);

  const handleUpdateAllDomains = useCallback(async (template: RuleTemplate) => {
    try {
      // Find domains with outdated versions using ONLY store data (no API calls)
      const { useDomainStore } = await import('@/store/domainStore');
      const storeData = useDomainStore.getState().allDomains;

      if (!storeData || storeData.length === 0) {
        notifications.error('No hay datos de dominios disponibles. Recarga la página.');
        return;
      }

      const affectedDomains = await findOutdatedDomains(template, storeData);

      if (affectedDomains.length === 0) {
        notifications.info('No hay dominios con versiones desactualizadas de esta regla');
        return;
      }

      // Show confirmation modal
      setUpdateConfirmationData({
        template,
        affectedDomains
      });
      setShowUpdateConfirmation(true);
    } catch (error) {
      console.error('Error checking outdated domains:', error);
      notifications.error('Error al verificar dominios desactualizados');
    }
  }, [notifications]);

  const registerProgressCallback = useCallback((callback: (progress: number) => void) => {
    setUpdateProgressCallback(() => callback);
  }, []);

  const handleRuleUpdateConfirmation = useCallback(async (updateDomains: boolean) => {
    if (!updateConfirmationData) return;

    const { template, affectedDomains } = updateConfirmationData;

    if (updateDomains) {
      const apiToken = tokenStorage.getToken();
      if (!apiToken) {
        notifications.error('API Token no encontrado.');
        return;
      }

      try {
        setUpdatingTemplate(template.id);

        const zoneIds = affectedDomains.map(domain => domain.zoneId);

        // Reset progress
        setUpdateProgress(0);

        const result = await updateRuleInDomains(
          template,
          zoneIds,
          apiToken,
          (completed, total) => {
            const progressPercentage = Math.round((completed / total) * 100);
            console.log(`Progress: ${completed}/${total} (${progressPercentage}%)`);
            setUpdateProgress(progressPercentage);

            // Call the modal's progress callback if available
            if (updateProgressCallback) {
              updateProgressCallback(progressPercentage);
            }
          }
        );

        if (result.successful > 0) {
          notifications.success(
            `Regla actualizada en ${result.successful}/${affectedDomains.length} dominios`
          );
        }

        if (result.failed.length > 0) {
          notifications.error(
            `Error al actualizar ${result.failed.length} dominios`
          );
        }

        // Refresh ONLY the affected domains instead of invalidating entire cache
        try {
          const { useDomainStore } = await import('@/store/domainStore');
          const store = useDomainStore.getState();

          console.log(`[SecurityRulesManager] Refreshing ${zoneIds.length} specific domains after rule update`);

          // Refresh only the affected domains
          for (const zoneId of zoneIds) {
            try {
              const affectedDomain = affectedDomains.find(d => d.zoneId === zoneId);
              if (affectedDomain) {
                console.log(`[SecurityRulesManager] Refreshing domain: ${affectedDomain.domainName} (${zoneId})`);
                await store.refreshSingleDomain(zoneId);
              }
            } catch (error) {
              console.warn(`[SecurityRulesManager] Failed to refresh domain ${zoneId}:`, error);
            }
          }
          console.log(`[SecurityRulesManager] Completed refreshing ${zoneIds.length} domains`);
        } catch (error) {
          console.warn('Failed to refresh affected domains:', error);
        }

      } catch (error) {
        console.error('Error updating domains:', error);
        notifications.error('Error al actualizar dominios');
      } finally {
        setUpdatingTemplate(null);
      }
    }

    // Reset modal state
    setShowUpdateConfirmation(false);
    setUpdateConfirmationData(null);
  }, [updateConfirmationData, notifications]);

  const resetForm = useCallback(() => {
    setFormData({
      name: '',
      description: '',
      expression: '',
      action: 'block',
      tags: [],
      applicableTags: [],
      excludedDomains: []
    });
  }, []);

  const updateFormField = useCallback((field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  useEffect(() => {
    loadTemplates();
  }, []); // Remove loadTemplates from dependencies to prevent infinite loop

  return {
    // State
    templates,
    loading,
    showCreateDialog,
    showEditDialog,
    editingTemplate,
    updatingTemplate,
    formData,
    showPreviewModal,
    previewData,
    showUpdateConfirmation,
    updateConfirmationData,
    ruleUsageStats,
    updateProgress,

    // Actions
    setShowCreateDialog,
    setShowEditDialog,
    setShowPreviewModal,
    setShowUpdateConfirmation,
    setUpdateConfirmationData,
    handleEditTemplate,
    handleUpdateAllDomains,
    executeBulkUpdate,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    updateFormField,
    resetForm,
    handleRuleUpdateConfirmation,
    registerProgressCallback,
    loadRuleUsageStats,
  };
}