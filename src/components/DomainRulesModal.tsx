'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Shield, Settings, AlertTriangle, Trash2, Info, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { RuleTemplate } from '@/types/cloudflare';
import { CollapsibleExpression } from './CollapsibleExpression';
import { tokenStorage } from '@/lib/tokenStorage';
import { useDomainStore } from '@/store/domainStore';

interface TemplateRule {
  friendlyId: string;
  originalName: string;
  version: string;
  expression: string;
  action: string;
  enabled: boolean;
  cloudflareRuleId: string;
}

interface CustomRule {
  cloudflareRuleId: string;
  description: string;
  expression: string;
  action: string;
  enabled: boolean;
}

interface DomainRulesData {
  templateRules: TemplateRule[];
  customRules: CustomRule[];
  domainName: string;
}

interface DomainRulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  zoneId: string | null;
  domainName: string;
}

export function DomainRulesModal({ isOpen, onClose, zoneId, domainName }: DomainRulesModalProps) {
  const [loading, setLoading] = useState(false);
  const [rulesData, setRulesData] = useState<DomainRulesData | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [availableTemplates, setAvailableTemplates] = useState<RuleTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [hasChanges, setHasChanges] = useState(false);
  const { refreshSingleDomain } = useDomainStore();

  const loadDomainRules = useCallback(async () => {
    if (!zoneId) return;
    const apiToken = tokenStorage.getToken();
    if (!apiToken) return;

    try {
      setLoading(true);
      
      const response = await fetch(`/api/domains/rules/${zoneId}`, {
        headers: { 'x-api-token': apiToken }
      });

      const result = await response.json();
      
      if (response.ok && result.success) {
        setRulesData(result.data);
      } else {
        console.error('[DomainRulesModal] Error response:', result);
        if (result.errorType === 'INSUFFICIENT_PERMISSIONS') {
          toast.error('Token sin permisos para reglas de seguridad.');
        } else if (result.errorType === 'JSON_PARSE_ERROR') {
          toast.error('Error de comunicación con Cloudflare. Intenta de nuevo.');
        } else {
          toast.error(result.error || 'Error al cargar reglas del dominio');
        }
      }
    } catch (error) {
      console.error('Error loading domain rules:', error);
      toast.error('Error de conexión al cargar las reglas');
    } finally {
      setLoading(false);
    }
  }, [zoneId]);

  const loadAvailableTemplates = async () => {
    try {
      console.log('[DomainRulesModal] Loading available templates...');
      const response = await fetch('/api/security-rules');
      const result = await response.json();
      console.log('[DomainRulesModal] Templates response:', result);

      if (result.success) {
        const enabledTemplates = result.data.templates.filter((t: RuleTemplate) => t.enabled);
        console.log('[DomainRulesModal] Enabled templates:', enabledTemplates);
        setAvailableTemplates(enabledTemplates);
      } else {
        console.error('[DomainRulesModal] Failed to load templates:', result);
      }
    } catch (error) {
      console.error('[DomainRulesModal] Error loading templates:', error);
    }
  };

  const handleApplyTemplate = async () => {
    console.log('[DomainRulesModal] Starting template application...');
    console.log('[DomainRulesModal] Selected template:', selectedTemplate);
    console.log('[DomainRulesModal] Zone ID:', zoneId);
    console.log('[DomainRulesModal] Available templates:', availableTemplates);

    if (!selectedTemplate || !zoneId) {
      console.log('[DomainRulesModal] Missing required data - aborting');
      return;
    }

    const apiToken = tokenStorage.getToken();
    if (!apiToken) {
      console.log('[DomainRulesModal] No API token - aborting');
      return;
    }

    const template = availableTemplates.find(t => t.friendlyId === selectedTemplate);
    console.log('[DomainRulesModal] Found template object:', template);

    if (!template) {
      console.log('[DomainRulesModal] Template not found in available templates - aborting');
      return;
    }

    try {
      setActionLoading('apply');

      const requestBody = {
        action: 'add',
        selectedRules: [selectedTemplate],
        targetZoneIds: [zoneId],
        preview: false
      };

      console.log('[DomainRulesModal] Sending request body:', requestBody);

      const response = await fetch(`/api/domains/rules/bulk-action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-token': apiToken
        },
        body: JSON.stringify(requestBody)
      });

      const result = await response.json();
      console.log('[DomainRulesModal] Apply template result:', result);

      if (result.success) {
        const addedCount = result.data?.results?.[0]?.message?.match(/Added: (\d+)/)?.[1] || '0';
        console.log('[DomainRulesModal] Rule application successful. Extracted added count:', addedCount);

        toast.success(`Regla ${selectedTemplate} aplicada exitosamente (${addedCount} regla${addedCount !== '1' ? 's' : ''} agregada${addedCount !== '1' ? 's' : ''})`);
        setSelectedTemplate('');

        console.log('[DomainRulesModal] Waiting 1 second for Cloudflare to process the rule...');
        await new Promise(resolve => setTimeout(resolve, 1000));

        console.log('[DomainRulesModal] Reloading domain rules...');
        await loadDomainRules();
        console.log('[DomainRulesModal] Domain rules reloaded');
        setHasChanges(true);

        // Also refresh the domain in the main store to update the table
        if (zoneId) {
          console.log('[DomainRulesModal] Refreshing domain in store after rule application');
          await refreshSingleDomain(zoneId);
          console.log('[DomainRulesModal] Domain store refreshed');
        }
      } else {
        console.error('[DomainRulesModal] Error applying template:', result);
        toast.error(`Error al aplicar la regla: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error applying template:', error);
      toast.error('Error al aplicar la regla');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteIndividualRule = async (ruleId: string, ruleName: string, isTemplate: boolean) => {
    if (!zoneId) return;
    const apiToken = tokenStorage.getToken();
    if (!apiToken) return;

    console.log(`[DomainRulesModal] Attempting to delete rule:`, {
      ruleId,
      ruleName,
      isTemplate,
      zoneId
    });

    try {
      setActionLoading(ruleId);

      if (isTemplate) {
        const response = await fetch(`/api/domains/rules/bulk-action`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-token': apiToken
          },
          body: JSON.stringify({
            action: 'remove',
            selectedRules: [ruleName],
            targetZoneIds: [zoneId],
            preview: false
          })
        });

        const result = await response.json();
        if (result.success) {
          toast.success(`Regla ${ruleName} eliminada exitosamente`);
          await loadDomainRules();
          setHasChanges(true);

          // Immediate refresh domain in store to update the table
          if (zoneId) {
            console.log('[DomainRulesModal] Refreshing domain after template rule deletion');
            await refreshSingleDomain(zoneId);
          }
        } else {
          toast.error('Error al eliminar la regla');
        }
      } else {
        const response = await fetch(`/api/domains/rules/custom/${ruleId}`, {
          method: 'DELETE',
          headers: {
            'x-api-token': apiToken,
            'x-zone-id': zoneId
          }
        });

        if (response.ok) {
          toast.success('Regla personalizada eliminada');
          await loadDomainRules();
          setHasChanges(true);

          // Immediate refresh domain in store to update the table
          if (zoneId) {
            console.log('[DomainRulesModal] Refreshing domain after custom rule deletion');
            await refreshSingleDomain(zoneId);
          }
        } else {
          toast.error('Error al eliminar la regla personalizada');
        }
      }
    } catch (error) {
      console.error('Error deleting rule:', error);
      toast.error('Error al eliminar la regla');
    } finally {
      setActionLoading(null);
    }
  };

  useEffect(() => {
    if (isOpen && zoneId) {
      loadDomainRules();
      loadAvailableTemplates();
      setHasChanges(false); // Reset changes flag when opening
    }
  }, [isOpen, zoneId, loadDomainRules]);

  const handleClose = useCallback(async () => {
    // If there were changes and we have a zoneId, refresh the domain one more time
    if (hasChanges && zoneId) {
      console.log('[DomainRulesModal] Modal closing with changes - final domain refresh');
      await refreshSingleDomain(zoneId);
    }
    setHasChanges(false);
    onClose();
  }, [hasChanges, zoneId, refreshSingleDomain, onClose]);

  const handleCleanTemplateRules = async () => {
    if (!zoneId || !rulesData) return;
    const apiToken = tokenStorage.getToken();
    if (!apiToken) return;

    try {
      setActionLoading('template');
      const response = await fetch('/api/domains/rules/clean', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-token': apiToken
        },
        body: JSON.stringify({
          zoneId,
          cleanType: 'template'
        })
      });

      if (!response.ok) throw new Error('Failed to clean template rules');

      const result = await response.json();
      if (result.success) {
        toast.success(`${result.data.removedCount} reglas de plantilla eliminadas`);
        await loadDomainRules();
        setHasChanges(true);

        // Immediate refresh domain in store to update the table
        if (zoneId) {
          console.log('[DomainRulesModal] Refreshing domain after cleaning template rules');
          await refreshSingleDomain(zoneId);
        }
      } else {
        toast.error('Error al limpiar reglas de plantilla');
      }
    } catch (error) {
      console.error('Error cleaning template rules:', error);
      toast.error('Error al limpiar reglas de plantilla');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCleanAllRules = async () => {
    if (!zoneId || !rulesData) return;
    const apiToken = tokenStorage.getToken();
    if (!apiToken) return;

    try {
      setActionLoading('all');
      const response = await fetch('/api/domains/rules/clean', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-token': apiToken
        },
        body: JSON.stringify({
          zoneId,
          cleanType: 'all'
        })
      });

      if (!response.ok) throw new Error('Failed to clean all rules');

      const result = await response.json();
      if (result.success) {
        toast.success(`${result.data.removedCount} reglas eliminadas`);
        await loadDomainRules();
        setHasChanges(true);

        // Immediate refresh domain in store to update the table
        if (zoneId) {
          console.log('[DomainRulesModal] Refreshing domain after cleaning all rules');
          await refreshSingleDomain(zoneId);
        }
      } else {
        toast.error('Error al limpiar todas las reglas');
      }
    } catch (error) {
      console.error('Error cleaning all rules:', error);
      toast.error('Error al limpiar todas las reglas');
    } finally {
      setActionLoading(null);
    }
  };

  const totalRules = rulesData ? rulesData.templateRules.length + rulesData.customRules.length : 0;
  
  const domainHasConflicts = useMemo(() => {
    return false;
  }, []);

  const getConflictDetails = useCallback(() => {
    if (!rulesData) return [];
    
    const conflicts: Array<{ruleId: string, message: string, suggestion?: string}> = [];
    
    rulesData.templateRules.forEach(rule => {
      if (rule.version && parseFloat(rule.version) < 2.0) {
        conflicts.push({
          ruleId: rule.friendlyId,
          message: `Versión desactualizada (v${rule.version}). Versión actual disponible: v2.0`,
          suggestion: 'Actualiza la regla para obtener las últimas mejoras de seguridad'
        });
      }
    });
    
    return conflicts;
  }, [rulesData]);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-6xl w-[90vw] max-h-[80vh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Reglas de Seguridad: {domainName}
          </DialogTitle>
          <DialogDescription>
            Gestiona las reglas de seguridad aplicadas a este dominio
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Cargando reglas...</span>
          </div>
        ) : rulesData ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">{totalRules}</div>
                  <div className="text-xs text-muted-foreground">Total</div>
                </div>
                <Separator orientation="vertical" className="h-8" />
                <div className="text-center">
                  <div className="text-lg font-semibold text-green-600">{rulesData.templateRules.length}</div>
                  <div className="text-xs text-muted-foreground">Plantillas</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold text-blue-600">{rulesData.customRules.length}</div>
                  <div className="text-xs text-muted-foreground">Personalizadas</div>
                </div>
              </div>
              
              <div className="flex gap-2">
                <div className="flex items-center gap-2 mr-2">
                  <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="Seleccionar" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableTemplates
                        .filter(template => !rulesData.templateRules.some(rule => rule.friendlyId === template.friendlyId))
                        .map((template) => (
                          <SelectItem key={template.id} value={template.friendlyId}>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">{template.friendlyId}</Badge>
                              <span className="truncate max-w-40">{template.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    onClick={handleApplyTemplate}
                    disabled={!selectedTemplate || actionLoading !== null}
                  >
                    {actionLoading === 'apply' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    <span className="ml-1">Aplicar</span>
                  </Button>
                </div>
                <Separator orientation="vertical" className="h-8" />
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleCleanAllRules}
                  disabled={totalRules === 0 || actionLoading !== null}
                >
                  {actionLoading === 'all' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  <span className="ml-1">Limpiar Todo</span>
                </Button>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-green-600" />
                  Reglas de Plantilla ({rulesData.templateRules.length})
                </CardTitle>
                <CardDescription>
                  Reglas aplicadas desde plantillas corporativas
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {rulesData.templateRules.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground">
                    No hay reglas de plantilla aplicadas
                  </div>
                ) : (
                  rulesData.templateRules.map((rule) => (
                    <div key={rule.cloudflareRuleId} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="font-mono">
                            {rule.friendlyId}
                          </Badge>
                          <span className="font-medium">{rule.originalName}</span>
                          <Badge variant="outline">v{rule.version}</Badge>
                          <Badge variant={rule.enabled ? "default" : "secondary"}>
                            {rule.enabled ? 'Activa' : 'Inactiva'}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge>{rule.action}</Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteIndividualRule(rule.cloudflareRuleId, rule.friendlyId, true)}
                            disabled={actionLoading !== null}
                            className="h-8 w-8 p-0"
                          >
                            {actionLoading === rule.cloudflareRuleId ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                      <CollapsibleExpression expression={rule.expression} />
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-4 w-4 text-blue-600" />
                  Reglas Personalizadas ({rulesData.customRules.length})
                </CardTitle>
                <CardDescription>
                  Reglas creadas directamente en Cloudflare (no desde plantillas)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {rulesData.customRules.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground">
                    No hay reglas personalizadas
                  </div>
                ) : (
                  rulesData.customRules.map((rule) => (
                    <div key={rule.cloudflareRuleId} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {rule.description || 'Regla sin nombre'}
                          </span>
                          <Badge variant={rule.enabled ? "default" : "secondary"}>
                            {rule.enabled ? 'Activa' : 'Inactiva'}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{rule.action}</Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteIndividualRule(rule.cloudflareRuleId, rule.description || 'custom', false)}
                            disabled={actionLoading !== null}
                            className="h-8 w-8 p-0"
                          >
                            {actionLoading === rule.cloudflareRuleId ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                      <CollapsibleExpression expression={rule.expression} />
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {domainHasConflicts && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    Conflictos Detectados
                  </CardTitle>
                  <CardDescription>
                    Se encontraron reglas con versiones desactualizadas o conflictos
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {getConflictDetails().map((conflict, index) => (
                      <Alert key={index} variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          <strong>{conflict.ruleId}:</strong> {conflict.message}
                          {conflict.suggestion && (
                            <div className="mt-1 text-sm text-muted-foreground">
                              Sugerencia: {conflict.suggestion}
                            </div>
                          )}
                        </AlertDescription>
                      </Alert>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {rulesData.customRules.length > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Importante:</strong> Las reglas personalizadas fueron creadas directamente en Cloudflare. 
                  Al usar "Limpiar Todo" se eliminarán junto con las reglas de plantilla.
                </AlertDescription>
              </Alert>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                No se pudieron cargar las reglas para este dominio.
              </AlertDescription>
            </Alert>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
