'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Plus, Minus, Trash2, AlertTriangle, Play } from 'lucide-react';
import { toast } from 'sonner';
import { RuleTemplate } from '@/types/cloudflare';
import { tokenStorage } from '@/lib/tokenStorage';

interface RulesActionBarProps {
  selectedDomains: string[];
  onClearSelection: () => void;
  onRefresh: () => void;
}

type ActionType = 'add' | 'remove' | 'clean';

export function RulesActionBar({ selectedDomains, onClearSelection, onRefresh }: RulesActionBarProps) {
  const [action, setAction] = useState<ActionType>('add');
  const [selectedRules, setSelectedRules] = useState<string[]>([]);
  const [templates, setTemplates] = useState<RuleTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewResults, setPreviewResults] = useState<any>(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const response = await fetch('/api/security-rules');
      const result = await response.json();
      if (result.success) {
        setTemplates(result.data.templates.filter((t: RuleTemplate) => t.enabled));
      }
    } catch (error) {
      console.error('Error loading templates:', error);
    }
  };

  const handleActionChange = (newAction: ActionType) => {
    setAction(newAction);
    setSelectedRules([]);
  };

  const toggleRuleSelection = (ruleId: string) => {
    setSelectedRules(prev => 
      prev.includes(ruleId) 
        ? prev.filter(id => id !== ruleId)
        : [...prev, ruleId]
    );
  };

  const handlePreview = async () => {
    const apiToken = tokenStorage.getToken();
    if (!apiToken) {
      toast.error('API Token no encontrado.');
      return;
    }
    if (selectedDomains.length === 0) {
      toast.error('Selecciona al menos un dominio');
      return;
    }
    if (action !== 'clean' && selectedRules.length === 0) {
      toast.error('Selecciona al menos una regla');
      return;
    }

    try {
      setLoading(true);
      
      const response = await fetch('/api/domains/rules/bulk-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-token': apiToken
        },
        body: JSON.stringify({
          action,
          selectedRules,
          targetZoneIds: selectedDomains,
          preview: true
        })
      });

      const result = await response.json();
      if (result.success) {
        setPreviewResults(result.data);
        setShowPreview(true);
      } else {
        toast.error('Error al generar vista previa');
      }
    } catch (error) {
      console.error('Error generating preview:', error);
      toast.error('Error al generar vista previa');
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async (confirmed = false) => {
    if (!confirmed) {
      await handlePreview();
      return;
    }

    const apiToken = tokenStorage.getToken();
    if (!apiToken) {
      toast.error('API Token no encontrado.');
      return;
    }

    try {
      setLoading(true);
      
      const response = await fetch('/api/domains/rules/bulk-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-token': apiToken
        },
        body: JSON.stringify({
          action,
          selectedRules,
          targetZoneIds: selectedDomains,
          preview: false
        })
      });

      const result = await response.json();
      if (result.success) {
        const { summary } = result.data;
        toast.success(`Acción completada: ${summary.successful}/${summary.total} exitosos`);
        onClearSelection();
        onRefresh();
        setShowPreview(false);
        setSelectedRules([]);
      } else {
        toast.error('Error al ejecutar acción');
      }
    } catch (error) {
      console.error('Error executing action:', error);
      toast.error('Error al ejecutar acción');
    } finally {
      setLoading(false);
    }
  };

  const getActionIcon = () => {
    switch (action) {
      case 'add': return <Plus className="h-4 w-4" />;
      case 'remove': return <Minus className="h-4 w-4" />;
      case 'clean': return <Trash2 className="h-4 w-4" />;
    }
  };

  const getActionText = () => {
    switch (action) {
      case 'add': return 'Agregar Reglas';
      case 'remove': return 'Eliminar Reglas';
      case 'clean': return 'Limpiar Todas';
    }
  };

  if (selectedDomains.length === 0) {
    return null;
  }

  return (
    <>
      <div className="flex items-center gap-4 p-4 bg-muted rounded-lg border">
        <div className="text-sm font-medium">
          {selectedDomains.length} dominios seleccionados
        </div>
        
        <Separator orientation="vertical" className="h-6" />
        
        <div className="flex items-center gap-2">
          <Select value={action} onValueChange={(value) => handleActionChange(value as ActionType)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="add">
                <div className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Agregar
                </div>
              </SelectItem>
              <SelectItem value="remove">
                <div className="flex items-center gap-2">
                  <Minus className="h-4 w-4" />
                  Eliminar
                </div>
              </SelectItem>
              <SelectItem value="clean">
                <div className="flex items-center gap-2">
                  <Trash2 className="h-4 w-4" />
                  Limpiar Todo
                </div>
              </SelectItem>
            </SelectContent>
          </Select>

          {action !== 'clean' && (
            <div className="flex items-center gap-1 flex-wrap">
              {templates.map((template) => {
                const friendlyId = template.friendlyId || template.name.match(/^(\d+)-/)?.[1]?.padStart(2, '0').replace(/^/, 'R') || `R${templates.indexOf(template) + 1}`.padStart(3, '0');
                return (
                  <Badge
                    key={template.id}
                    variant={selectedRules.includes(friendlyId) ? "default" : "outline"}
                    className="cursor-pointer hover:opacity-80"
                    onClick={() => toggleRuleSelection(friendlyId)}
                  >
                    {friendlyId}
                  </Badge>
                );
              })}
            </div>
          )}

          <Button 
            onClick={() => handleExecute(false)}
            disabled={loading || (action !== 'clean' && selectedRules.length === 0)}
            className="ml-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            <span className="ml-1">Procesar</span>
          </Button>
        </div>
      </div>

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {getActionIcon()}
              Vista Previa: {getActionText()}
            </DialogTitle>
            <DialogDescription>
              Revisa los cambios antes de aplicarlos
            </DialogDescription>
          </DialogHeader>

          {previewResults && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-primary">{previewResults.summary.total}</div>
                  <div className="text-xs text-muted-foreground">Total</div>
                </div>
                <div>
                  <div className="text-lg font-semibold text-green-600">{previewResults.summary.successful}</div>
                  <div className="text-xs text-muted-foreground">Exitosos</div>
                </div>
                <div>
                  <div className="text-lg font-semibold text-red-600">{previewResults.summary.failed}</div>
                  <div className="text-xs text-muted-foreground">Fallidos</div>
                </div>
              </div>

              {previewResults.summary.conflicts > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    {previewResults.summary.conflicts} regla(s) existente(s) serán actualizadas automáticamente.
                  </AlertDescription>
                </Alert>
              )}

              <div className="max-h-60 overflow-y-auto space-y-2">
                {previewResults.results.slice(0, 10).map((result: any, index: number) => (
                  <div key={index} className="flex items-center justify-between p-2 border rounded">
                    <span className="text-sm">{result.domainName}</span>
                    <Badge variant={result.success ? "default" : "destructive"}>
                      {result.success ? 'OK' : 'Error'}
                    </Badge>
                  </div>
                ))}
                {previewResults.results.length > 10 && (
                  <div className="text-center text-sm text-muted-foreground">
                    ... y {previewResults.results.length - 10} dominios más
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              Cancelar
            </Button>
            <Button onClick={() => handleExecute(true)} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : getActionIcon()}
              <span className="ml-1">Ejecutar {getActionText()}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
