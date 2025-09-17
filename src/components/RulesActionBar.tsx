'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, Plus, Minus, Trash2, Play, Shield, ShieldOff, Siren, Bot } from 'lucide-react';
import { toast } from 'sonner';
import { RuleTemplate } from '@/types/cloudflare';
import { tokenStorage } from '@/lib/tokenStorage';

interface RulesActionBarProps {
  selectedDomains: string[];
  onClearSelection: () => void;
  onRefreshSelectedDomains?: (zoneIds: string[]) => Promise<void>;
  onBulkProxy?: (enabled: boolean) => Promise<void>;
  onBulkUnderAttack?: (enabled: boolean) => Promise<void>;
  onBulkBotFight?: (enabled: boolean) => Promise<void>;
}

type ActionType = 'add' | 'remove' | 'clean-custom' | 'clean';

export function RulesActionBar({ selectedDomains, onClearSelection, onRefreshSelectedDomains, onBulkProxy, onBulkUnderAttack, onBulkBotFight }: RulesActionBarProps) {
  const [action, setAction] = useState<ActionType>('add');
  const [selectedRules, setSelectedRules] = useState<string[]>([]);
  const [templates, setTemplates] = useState<RuleTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmationMessage, setConfirmationMessage] = useState<string>('');
  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);

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

  const getConfirmationMessage = () => {
    const domainCount = selectedDomains.length;
    const ruleCount = selectedRules.length;

    switch (action) {
      case 'add':
        return `Se van a agregar ${ruleCount} reglas a ${domainCount} dominios seleccionados`;
      case 'remove':
        return `Se van a eliminar ${ruleCount} reglas de ${domainCount} dominios seleccionados`;
      case 'clean-custom':
        return `Se van a eliminar todas las reglas personalizadas de ${domainCount} dominios seleccionados`;
      case 'clean':
        return `Se van a eliminar todas las reglas de ${domainCount} dominios seleccionados`;
      default:
        return '';
    }
  };

  const handleRulesAction = async () => {
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

        // Refresh only affected domains instead of all domains
        if (onRefreshSelectedDomains) {
          await onRefreshSelectedDomains(selectedDomains);
        }

      } else {
        toast.error('Error al ejecutar acción');
      }
    } catch (error) {
      console.error('Error executing action:', error);
      toast.error('Error al ejecutar acción');
    } finally {
      setLoading(false);
      setShowConfirmation(false);
    }
  };

  const handleConfirmAction = () => {
    // Validations
    if (selectedDomains.length === 0) {
      toast.error('Selecciona al menos un dominio');
      return;
    }
    if (action !== 'clean' && action !== 'clean-custom' && selectedRules.length === 0) {
      toast.error('Selecciona al menos una regla');
      return;
    }

    const message = getConfirmationMessage();
    setConfirmationMessage(message);
    setPendingAction(() => () => handleRulesAction());
    setShowConfirmation(true);
  };

  const executeConfirmedAction = async () => {
    if (pendingAction) {
      await pendingAction();
      setPendingAction(null);
    }
  };

  const handleBulkAction = (actionType: 'proxy' | 'underAttack' | 'botFight', enabled: boolean) => {
    if (selectedDomains.length === 0) {
      toast.error('Selecciona al menos un dominio');
      return;
    }

    const actionName = {
      proxy: enabled ? 'habilitar Proxy' : 'deshabilitar Proxy',
      underAttack: enabled ? 'activar Under Attack Mode' : 'desactivar Under Attack Mode',
      botFight: enabled ? 'activar Bot Fight Mode' : 'desactivar Bot Fight Mode'
    }[actionType];

    const message = `Se va a ${actionName} en ${selectedDomains.length} dominios seleccionados`;
    setConfirmationMessage(message);

    const actionFunction = async () => {
      try {
        setLoading(true);
        switch (actionType) {
          case 'proxy':
            if (onBulkProxy) await onBulkProxy(enabled);
            break;
          case 'underAttack':
            if (onBulkUnderAttack) await onBulkUnderAttack(enabled);
            break;
          case 'botFight':
            if (onBulkBotFight) await onBulkBotFight(enabled);
            break;
        }
      } finally {
        setLoading(false);
        setShowConfirmation(false);
      }
    };

    setPendingAction(() => () => actionFunction());
    setShowConfirmation(true);
  };

  const getActionIcon = () => {
    switch (action) {
      case 'add': return <Plus className="h-4 w-4" />;
      case 'remove': return <Minus className="h-4 w-4" />;
      case 'clean-custom': return <Trash2 className="h-4 w-4" />;
      case 'clean': return <Trash2 className="h-4 w-4" />;
    }
  };

  const getActionText = () => {
    switch (action) {
      case 'add': return 'Agregar Reglas';
      case 'remove': return 'Eliminar Reglas';
      case 'clean-custom': return 'Eliminar Custom';
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
              <SelectItem value="clean-custom">
                <div className="flex items-center gap-2">
                  <Trash2 className="h-4 w-4" />
                  Eliminar Custom
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

          {action !== 'clean' && action !== 'clean-custom' && (
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
            onClick={handleConfirmAction}
            disabled={loading || (action !== 'clean' && action !== 'clean-custom' && selectedRules.length === 0)}
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

        {onBulkProxy && (
          <>
            <Separator orientation="vertical" className="h-6" />
            <TooltipProvider>
              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleBulkAction('proxy', true)}
                      disabled={loading}
                      className="p-2 hover:bg-green-50"
                    >
                      <Shield className="h-4 w-4 text-green-600" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Habilitar Proxy</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleBulkAction('proxy', false)}
                      disabled={loading}
                      className="p-2 hover:bg-red-50"
                    >
                      <Shield className="h-4 w-4 text-gray-400" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Deshabilitar Proxy</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </>
        )}

        {onBulkUnderAttack && (
          <>
            <Separator orientation="vertical" className="h-6" />
            <TooltipProvider>
              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleBulkAction('underAttack', true)}
                      disabled={loading}
                      className="p-2 hover:bg-orange-50"
                    >
                      <Siren className="h-4 w-4 text-red-500" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Habilitar Under Attack</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleBulkAction('underAttack', false)}
                      disabled={loading}
                      className="p-2 hover:bg-gray-50"
                    >
                      <Siren className="h-4 w-4 text-gray-400" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Deshabilitar Under Attack</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </>
        )}

        {onBulkBotFight && (
          <>
            <Separator orientation="vertical" className="h-6" />
            <TooltipProvider>
              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleBulkAction('botFight', true)}
                      disabled={loading}
                      className="p-2 hover:bg-blue-50"
                    >
                      <Bot className="h-4 w-4 text-blue-500" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Habilitar Bot Fight</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleBulkAction('botFight', false)}
                      disabled={loading}
                      className="p-2 hover:bg-gray-50"
                    >
                      <Bot className="h-4 w-4 text-gray-400" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Deshabilitar Bot Fight</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </>
        )}
      </div>

      {showConfirmation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Confirmar Acción</h3>
            <p className="text-gray-600 mb-6">{confirmationMessage}</p>
            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setShowConfirmation(false);
                  setPendingAction(null);
                }}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button
                onClick={executeConfirmedAction}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Confirmar
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
