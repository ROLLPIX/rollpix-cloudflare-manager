'use client';

import { useState, useEffect, useCallback } from 'react';
import { RuleTemplate } from '@/types/cloudflare';
import { tokenStorage } from '@/lib/tokenStorage';
import { useNotifications } from './useNotifications';
import { BulkUpdatePreviewModal } from '@/components/BulkUpdatePreviewModal';

export function useSecurityRulesManager() {
  const [templates, setTemplates] = useState<RuleTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<RuleTemplate | null>(null);
  const [updatingTemplate, setUpdatingTemplate] = useState<string | null>(null);
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

  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/security-rules');
      const result = await response.json();

      if (result.success) {
        setTemplates(result.data.templates);
      } else {
        notifications.error('Error al cargar plantillas de reglas');
      }
    } catch (error) {
      console.error('Error loading templates:', error);
      notifications.error('Error al cargar plantillas de reglas');
    } finally {
      setLoading(false);
    }
  }, [notifications]);

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
      const response = await fetch(`/api/security-rules/${editingTemplate.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const result = await response.json();

      if (result.success) {
        setTemplates(prev => prev.map(t => t.id === editingTemplate.id ? result.data : t));
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
    if (!confirm('¿Estás seguro de que quieres eliminar esta plantilla?')) {
      return;
    }

    try {
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
  }, [notifications]);

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
    await getBulkUpdatePreview(template);
  }, [getBulkUpdatePreview]);

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

    // Actions
    setShowCreateDialog,
    setShowEditDialog,
    setShowPreviewModal,
    handleEditTemplate,
    handleUpdateAllDomains,
    executeBulkUpdate,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    updateFormField,
    resetForm,
  };
}