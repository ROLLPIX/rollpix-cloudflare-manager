'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Shield, Settings, AlertTriangle, Trash2, Plus, Edit, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { RuleTemplate } from '@/types/cloudflare';
import { tokenStorage } from '@/lib/tokenStorage';

interface TemplateManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TemplateForm {
  friendlyId: string;
  name: string;
  description: string;
  expression: string;
  action: 'block' | 'challenge' | 'allow' | 'log';
  enabled: boolean;
  tags: string[];
}

const emptyTemplate: TemplateForm = {
  friendlyId: '',
  name: '',
  description: '',
  expression: '',
  action: 'block',
  enabled: true,
  tags: []
};

export function TemplateManagementModal({ isOpen, onClose }: TemplateManagementModalProps) {
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<RuleTemplate[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [formData, setFormData] = useState<TemplateForm>(emptyTemplate);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadTemplates();
    }
  }, [isOpen]);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/security-rules');
      if (response.ok) {
        const data = await response.json();
        setTemplates(data.templates || []);
      } else {
        throw new Error('Error al cargar plantillas');
      }
    } catch (error) {
      console.error('Error loading templates:', error);
      toast.error('Error al cargar plantillas');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (template: RuleTemplate) => {
    setEditingTemplate(template.id);
    setFormData({
      friendlyId: template.friendlyId,
      name: template.name,
      description: template.description,
      expression: template.expression,
      action: template.action as 'block' | 'challenge' | 'allow' | 'log',
      enabled: template.enabled,
      tags: template.tags || []
    });
    setIsCreating(false);
  };

  const handleCreate = () => {
    setIsCreating(true);
    setEditingTemplate('new');

    // Generate next friendly ID
    const existingIds = templates.map(t => t.friendlyId).filter(id => id.match(/^R\d+$/));
    const nextNumber = existingIds.length > 0
      ? Math.max(...existingIds.map(id => parseInt(id.substring(1)))) + 1
      : 1;

    setFormData({
      ...emptyTemplate,
      friendlyId: `R${String(nextNumber).padStart(2, '0')}`
    });
  };

  const handleCancel = () => {
    setEditingTemplate(null);
    setIsCreating(false);
    setFormData(emptyTemplate);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.expression || !formData.friendlyId) {
      toast.error('Todos los campos obligatorios deben estar completados');
      return;
    }

    const apiToken = tokenStorage.getToken();
    if (!apiToken) {
      toast.error('Token API no encontrado');
      return;
    }

    setLoading(true);
    try {
      const url = isCreating ? '/api/security-rules' : `/api/security-rules/${editingTemplate}`;
      const method = isCreating ? 'POST' : 'PUT';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-api-token': apiToken
        },
        body: JSON.stringify({
          ...formData,
          version: isCreating ? '1.0.0' : undefined, // Version handled by API for updates
          priority: 100,
          applicableTags: [],
          excludedDomains: []
        })
      });

      if (response.ok) {
        toast.success(isCreating ? 'Plantilla creada exitosamente' : 'Plantilla actualizada exitosamente');
        await loadTemplates();
        handleCancel();
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Error al guardar plantilla');
      }
    } catch (error) {
      console.error('Error saving template:', error);
      toast.error(error instanceof Error ? error.message : 'Error al guardar plantilla');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (templateId: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar esta plantilla?')) {
      return;
    }

    const apiToken = tokenStorage.getToken();
    if (!apiToken) {
      toast.error('Token API no encontrado');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/security-rules/${templateId}`, {
        method: 'DELETE',
        headers: {
          'x-api-token': apiToken
        }
      });

      if (response.ok) {
        toast.success('Plantilla eliminada exitosamente');
        await loadTemplates();
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Error al eliminar plantilla');
      }
    } catch (error) {
      console.error('Error deleting template:', error);
      toast.error(error instanceof Error ? error.message : 'Error al eliminar plantilla');
    } finally {
      setLoading(false);
    }
  };

  const updateFormField = (field: keyof TemplateForm, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Gestión de Plantillas de Reglas
          </DialogTitle>
          <DialogDescription>
            Crea, edita y elimina plantillas de reglas de seguridad para aplicar en múltiples dominios.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Create new template button */}
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              {templates.length} plantilla{templates.length !== 1 ? 's' : ''} creada{templates.length !== 1 ? 's' : ''}
            </div>
            <Button onClick={handleCreate} disabled={loading || editingTemplate !== null}>
              <Plus className="h-4 w-4 mr-2" />
              Nueva Plantilla
            </Button>
          </div>

          {loading && templates.length === 0 && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Cargando plantillas...
            </div>
          )}

          {/* Template list */}
          <div className="space-y-4">
            {templates.map((template) => (
              <Card key={template.id} className={editingTemplate === template.id ? 'border-blue-500' : ''}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="font-mono">
                        {template.friendlyId}
                      </Badge>
                      <CardTitle className="text-base">{template.name}</CardTitle>
                      <Badge variant={template.enabled ? 'default' : 'secondary'}>
                        {template.enabled ? 'Habilitada' : 'Deshabilitada'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      {editingTemplate !== template.id && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(template)}
                            disabled={loading || editingTemplate !== null}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(template.id)}
                            disabled={loading}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <CardDescription>
                    {template.description} • Versión {template.version} • Acción: {template.action}
                  </CardDescription>
                </CardHeader>

                {editingTemplate === template.id && (
                  <CardContent className="border-t">
                    <TemplateForm
                      formData={formData}
                      onUpdate={updateFormField}
                      onSave={handleSave}
                      onCancel={handleCancel}
                      loading={loading}
                      isCreating={false}
                    />
                  </CardContent>
                )}

                {editingTemplate !== template.id && (
                  <CardContent className="pt-0">
                    <div className="space-y-2">
                      <div className="text-sm">
                        <span className="font-medium">Expression:</span>
                        <div className="mt-1 p-2 bg-gray-50 rounded text-xs font-mono break-all">
                          {template.expression}
                        </div>
                      </div>
                      {template.tags && template.tags.length > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">Tags:</span>
                          {template.tags.map((tag, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}

            {/* New template form */}
            {isCreating && editingTemplate === 'new' && (
              <Card className="border-green-500">
                <CardHeader>
                  <CardTitle className="text-green-700">Nueva Plantilla</CardTitle>
                </CardHeader>
                <CardContent>
                  <TemplateForm
                    formData={formData}
                    onUpdate={updateFormField}
                    onSave={handleSave}
                    onCancel={handleCancel}
                    loading={loading}
                    isCreating={true}
                  />
                </CardContent>
              </Card>
            )}
          </div>

          {templates.length === 0 && !loading && (
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                No hay plantillas creadas aún. Crea tu primera plantilla para comenzar a gestionar reglas de seguridad.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface TemplateFormProps {
  formData: TemplateForm;
  onUpdate: (field: keyof TemplateForm, value: any) => void;
  onSave: () => void;
  onCancel: () => void;
  loading: boolean;
  isCreating: boolean;
}

function TemplateForm({ formData, onUpdate, onSave, onCancel, loading, isCreating }: TemplateFormProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label htmlFor="friendlyId">ID Amigable *</Label>
          <Input
            id="friendlyId"
            value={formData.friendlyId}
            onChange={(e) => onUpdate('friendlyId', e.target.value)}
            placeholder="R01, R02, etc."
            disabled={!isCreating}
          />
        </div>
        <div>
          <Label htmlFor="name">Nombre *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => onUpdate('name', e.target.value)}
            placeholder="SQL Injection Protection"
          />
        </div>
        <div>
          <Label htmlFor="action">Acción *</Label>
          <Select value={formData.action} onValueChange={(value) => onUpdate('action', value)}>
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
        <Label htmlFor="description">Descripción</Label>
        <Input
          id="description"
          value={formData.description}
          onChange={(e) => onUpdate('description', e.target.value)}
          placeholder="Descripción de la regla de seguridad"
        />
      </div>

      <div>
        <Label htmlFor="expression">Expression *</Label>
        <Textarea
          id="expression"
          value={formData.expression}
          onChange={(e) => onUpdate('expression', e.target.value)}
          placeholder="(http.request.uri.path contains '/admin') or (http.request.uri.query contains 'union')"
          className="font-mono text-sm min-h-20 resize-y"
        />
      </div>

      <div>
        <Label htmlFor="tags">Tags (separados por comas)</Label>
        <Input
          id="tags"
          value={formData.tags.join(', ')}
          onChange={(e) => onUpdate('tags', e.target.value.split(',').map(tag => tag.trim()).filter(Boolean))}
          placeholder="sql-injection, security, web-application"
        />
      </div>

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={formData.enabled}
            onChange={(e) => onUpdate('enabled', e.target.checked)}
            className="rounded"
          />
          <span className="text-sm">Habilitada</span>
        </label>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={loading}>
          <X className="h-4 w-4 mr-2" />
          Cancelar
        </Button>
        <Button onClick={onSave} disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          {isCreating ? 'Crear Plantilla' : 'Guardar Cambios'}
        </Button>
      </div>
    </div>
  );
}