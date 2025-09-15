'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Shield, Plus, Trash2, Edit2, RefreshCw } from 'lucide-react';
import { RuleTemplate } from '@/types/cloudflare';
import { CollapsibleExpression } from './CollapsibleExpression';
import { tokenStorage } from '@/lib/tokenStorage';

export default function SecurityRulesManager() {
  const [templates, setTemplates] = useState<RuleTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<RuleTemplate | null>(null);
  const [updatingTemplate, setUpdatingTemplate] = useState<string | null>(null);

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
        toast.error('Error al cargar plantillas de reglas');
      }
    } catch (error) {
      console.error('Error loading templates:', error);
      toast.error('Error al cargar plantillas de reglas');
    } finally {
      setLoading(false);
    }
  }, []);


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
        setFormData({
          name: '',
          description: '',
          expression: '',
          action: 'block',
          tags: [],
          applicableTags: [],
          excludedDomains: []
        });
        toast.success('Plantilla creada exitosamente');
      } else {
        toast.error(result.error || 'Error al crear plantilla');
      }
    } catch (error) {
      console.error('Error creating template:', error);
      toast.error('Error al crear plantilla');
    }
  }, [formData]);

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
        setFormData({
          name: '',
          description: '',
          expression: '',
          action: 'block',
          tags: [],
          applicableTags: [],
          excludedDomains: []
        });
        toast.success('Plantilla actualizada exitosamente');
      } else {
        toast.error(result.error || 'Error al actualizar plantilla');
      }
    } catch (error) {
      console.error('Error updating template:', error);
      toast.error('Error al actualizar plantilla');
    }
  }, [formData, editingTemplate]);

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
        toast.success('Plantilla eliminada exitosamente');
      } else {
        toast.error(result.error || 'Error al eliminar plantilla');
      }
    } catch (error) {
      console.error('Error deleting template:', error);
      toast.error('Error al eliminar plantilla');
    }
  }, []);

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

  const handleUpdateAllDomains = useCallback(async (template: RuleTemplate) => {
    const apiToken = tokenStorage.getToken();
    if (!apiToken) {
      toast.error('API Token no encontrado.');
      return;
    }
    try {
      setUpdatingTemplate(template.id);
      
      const analyzeResponse = await fetch('/api/security-rules/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiToken, forceRefresh: false })
      });
      
      if (!analyzeResponse.ok) throw new Error('Failed to analyze domains');
      
      const analyzeResult = await analyzeResponse.json();
      if (!analyzeResult.success) throw new Error(analyzeResult.error);
      
      const domainsToUpdate: string[] = [];
      
      for (const domainStatus of analyzeResult.data.domains) {
        if (domainStatus.ruleStatus && domainStatus.ruleStatus.appliedRules) {
          const hasOlderVersion = domainStatus.ruleStatus.appliedRules.some((rule: any) => 
            rule.friendlyId === template.friendlyId && 
            rule.version && 
            parseFloat(rule.version) < parseFloat(template.version)
          );
          
          if (hasOlderVersion) {
            domainsToUpdate.push(domainStatus.zoneId);
          }
        }
      }
      
      if (domainsToUpdate.length === 0) {
        toast.info('No se encontraron dominios con versiones anteriores de esta regla');
        return;
      }
      
      const updateResponse = await fetch('/api/domains/rules/bulk-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-token': apiToken
        },
        body: JSON.stringify({
          action: 'add',
          selectedRules: [template.friendlyId],
          targetZoneIds: domainsToUpdate,
          preview: false
        })
      });
      
      const updateResult = await updateResponse.json();
      if (updateResult.success) {
        const { summary } = updateResult.data;
        toast.success(`Regla actualizada en ${summary.successful}/${summary.total} dominios`);
      } else {
        toast.error('Error al actualizar dominios');
      }
      
    } catch (error) {
      console.error('Error updating template in all domains:', error);
      toast.error('Error al actualizar regla en todos los dominios');
    } finally {
      setUpdatingTemplate(null);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Plantillas de Reglas de Seguridad
          </h2>
          <p className="text-muted-foreground">
            Gestiona plantillas de reglas que se pueden aplicar a múltiples dominios
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nueva Plantilla
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">Plantillas de Reglas ({templates.length})</h3>
        </div>
        
        {templates.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-8 text-center">
              <Shield className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No hay plantillas configuradas</h3>
              <p className="text-muted-foreground mb-4">
                Crea tu primera plantilla de regla de seguridad para comenzar
              </p>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Crear Primera Plantilla
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {templates.map((template) => (
              <Card key={template.id} className="relative">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="font-mono">
                        {template.friendlyId}
                      </Badge>
                      <CardTitle className="text-lg">{template.name}</CardTitle>
                      <Badge variant={template.enabled ? "default" : "secondary"}>
                        {template.enabled ? 'Activa' : 'Inactiva'}
                      </Badge>
                      <Badge variant="outline">v{template.version}</Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleEditTemplate(template)}
                        title="Editar plantilla"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleUpdateAllDomains(template)}
                        disabled={updatingTemplate !== null}
                        title="Actualizar en todos los dominios que tengan versiones anteriores"
                      >
                        {updatingTemplate === template.id ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => deleteTemplate(template.id)}
                        title="Eliminar plantilla"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="font-mono text-xs">
                      ID: {template.id}
                    </Badge>
                  </div>
                  <CardDescription>{template.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <CollapsibleExpression expression={template.expression} />
                  <div className="flex items-center gap-4">
                    <Badge>{template.action}</Badge>
                    <div className="text-sm text-muted-foreground">
                      {template.tags.length > 0 && (
                        <span>Tags: {template.tags.join(', ')}</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Crear Nueva Plantilla</DialogTitle>
            <DialogDescription>
              Define una nueva plantilla de regla de seguridad
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="rule-name">Nombre</Label>
                <Input
                  id="rule-name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Nombre de la regla"
                />
              </div>
              <div>
                <Label htmlFor="rule-action">Acción</Label>
                <Select value={formData.action} onValueChange={(value) => {
                  setFormData(prev => ({ ...prev, action: value as any }));
                }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="block">Block</SelectItem>
                    <SelectItem value="challenge">Challenge</SelectItem>
                    <SelectItem value="allow">Allow</SelectItem>
                    <SelectItem value="log">Log</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div>
              <Label htmlFor="rule-description">Descripción</Label>
              <Textarea
                id="rule-description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Descripción de la regla"
              />
            </div>
            
            <div>
              <Label htmlFor="rule-expression">Expresión de Cloudflare</Label>
              <Textarea
                id="rule-expression"
                value={formData.expression}
                onChange={(e) => setFormData(prev => ({ ...prev, expression: e.target.value }))}
                placeholder='(ip.geoip.country in {"CN" "RU"}) or (http.user_agent contains "bot")'
                className="font-mono text-sm min-h-[100px] max-h-[300px] overflow-y-auto resize-y"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={createTemplate} disabled={!formData.name || !formData.expression}>
              Crear Plantilla
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar Plantilla</DialogTitle>
            <DialogDescription>
              Modifica la plantilla de regla de seguridad
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="edit-rule-name">Nombre</Label>
                <Input
                  id="edit-rule-name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Nombre de la regla"
                />
              </div>
              <div>
                <Label htmlFor="edit-rule-action">Acción</Label>
                <Select value={formData.action} onValueChange={(value) => {
                  setFormData(prev => ({ ...prev, action: value as any }));
                }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="block">Block</SelectItem>
                    <SelectItem value="challenge">Challenge</SelectItem>
                    <SelectItem value="allow">Allow</SelectItem>
                    <SelectItem value="log">Log</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div>
              <Label htmlFor="edit-rule-description">Descripción</Label>
              <Textarea
                id="edit-rule-description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Descripción de la regla"
              />
            </div>
            
            <div>
              <Label htmlFor="edit-rule-expression">Expresión de Cloudflare</Label>
              <Textarea
                id="edit-rule-expression"
                value={formData.expression}
                onChange={(e) => setFormData(prev => ({ ...prev, expression: e.target.value }))}
                placeholder='(ip.geoip.country in {"CN" "RU"}) or (http.user_agent contains "bot")'
                className="font-mono text-sm min-h-[100px] max-h-[300px] overflow-y-auto resize-y"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={updateTemplate} disabled={!formData.name || !formData.expression}>
              Actualizar Plantilla
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
