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
import { BulkOperationProgressModal } from './BulkOperationProgressModal';
import { useBulkOperation } from '@/hooks/useBulkOperation';
import { useDomainStore } from '@/store/domainStore';

interface RulesActionBarProps {
  selectedDomains: string[]; // Zone IDs of selected domains
  onClearSelection: () => void;
  onRefreshSelectedDomains?: (zoneIds: string[]) => Promise<void>;
  onBulkProxy?: (enabled: boolean) => Promise<void>;
  onBulkUnderAttack?: (enabled: boolean) => Promise<void>;
  onBulkBotFight?: (enabled: boolean) => Promise<void>;
}

type ActionType = 'add' | 'remove' | 'clean' | 'proxy' | 'underAttack' | 'botFight';

export function RulesActionBar({ selectedDomains, onClearSelection, onRefreshSelectedDomains, onBulkProxy, onBulkUnderAttack, onBulkBotFight }: RulesActionBarProps) {
  const [action, setAction] = useState<ActionType>('add');
  const [selectedRules, setSelectedRules] = useState<string[]>([]);
  const [templates, setTemplates] = useState<RuleTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [useNewDNSModal, setUseNewDNSModal] = useState(false); // Feature flag for DNS modal
  const [useNewFirewallModal, setUseNewFirewallModal] = useState(false); // Feature flag for firewall modal

  const apiToken = tokenStorage.getToken() || '';
  const { allDomains } = useDomainStore();

  const bulkOperation = useBulkOperation({
    endpoint: '/api/domains/rules/bulk-action-stream',
    apiToken,
    onComplete: (summary) => {
      toast.success(`Operación completada: ${summary.successful} éxitos, ${summary.failed} errores`);
      if (onRefreshSelectedDomains) {
        onRefreshSelectedDomains(selectedDomains);
      }
    },
    onError: (error) => {
      toast.error(`Error en la operación: ${error}`);
    }
  });

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

  const getDomainName = (zoneId: string): string => {
    const domain = allDomains.find(d => d.zoneId === zoneId);
    return domain?.domain || zoneId;
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

  const getModalTitle = () => {
    const domainCount = selectedDomains?.length || 0;
    const ruleCount = selectedRules?.length || 0;
    const isEnabled = selectedRules.includes('enabled');

    switch (action) {
      case 'add':
        return `Agregar ${ruleCount} reglas a ${domainCount} dominios`;
      case 'remove':
        return `Eliminar ${ruleCount} reglas de ${domainCount} dominios`;
      case 'clean':
        return `Limpiar todas las reglas de ${domainCount} dominios`;
      case 'proxy':
        return `${isEnabled ? 'Habilitar' : 'Deshabilitar'} proxy en ${domainCount} dominios`;
      case 'underAttack':
        return `${isEnabled ? 'Activar' : 'Desactivar'} Under Attack Mode en ${domainCount} dominios`;
      case 'botFight':
        return `${isEnabled ? 'Activar' : 'Desactivar'} Bot Fight Mode en ${domainCount} dominios`;
      default:
        return 'Operación masiva';
    }
  };

  const handleConfirmAction = () => {
    // Validations
    if (!selectedDomains || selectedDomains.length === 0) {
      toast.error('Selecciona al menos un dominio');
      return;
    }
    if (action !== 'clean' && (!selectedRules || selectedRules.length === 0)) {
      toast.error('Selecciona al menos una regla');
      return;
    }

    // Initialize domains for the progress modal
    const domains = selectedDomains.map(zoneId => ({
      zoneId,
      domainName: getDomainName(zoneId)
    }));

    bulkOperation.initializeDomains(domains);
    setShowProgressModal(true);
  };

  const handleStartOperation = async () => {
    if (action === 'proxy') {
      // DNS operations using new streaming system
      const endpoint = '/api/domains/dns/bulk-action-stream';
      const payload = {
        action: selectedRules.includes('enabled') ? 'enable_proxy' : 'disable_proxy',
        targetDomains: selectedDomains.map(zoneId => ({
          zoneId,
          domainName: getDomainName(zoneId)
        }))
      };
      await bulkOperation.startCustomOperation(endpoint, payload);
    } else if (action === 'underAttack' || action === 'botFight') {
      // Firewall operations using new streaming system
      const endpoint = '/api/domains/firewall/bulk-action-stream';
      const actionMap = {
        underAttack: selectedRules.includes('enabled') ? 'enable_under_attack' : 'disable_under_attack',
        botFight: selectedRules.includes('enabled') ? 'enable_bot_fight' : 'disable_bot_fight'
      };
      const payload = {
        action: actionMap[action as keyof typeof actionMap],
        targetDomains: selectedDomains.map(zoneId => ({
          zoneId,
          domainName: getDomainName(zoneId)
        }))
      };
      await bulkOperation.startCustomOperation(endpoint, payload);
    } else {
      // Rules operations with existing streaming system
      await bulkOperation.startOperation({
        action,
        selectedRules,
        targetZoneIds: selectedDomains
      });
    }
  };

  const handleCloseModal = () => {
    setShowProgressModal(false);
    bulkOperation.resetOperation();
  };

  const handleBulkAction = (actionType: 'proxy' | 'underAttack' | 'botFight', enabled: boolean) => {
    if (!selectedDomains || selectedDomains.length === 0) {
      toast.error('Selecciona al menos un dominio');
      return;
    }

    const actionName = {
      proxy: enabled ? 'habilitar Proxy' : 'deshabilitar Proxy',
      underAttack: enabled ? 'activar Under Attack Mode' : 'desactivar Under Attack Mode',
      botFight: enabled ? 'activar Bot Fight Mode' : 'desactivar Bot Fight Mode'
    }[actionType];

    // Check if we should use the new modal for DNS operations
    if (actionType === 'proxy' && useNewDNSModal) {
      // Use new modal system for DNS operations
      const domains = selectedDomains.map(zoneId => ({
        zoneId,
        domainName: getDomainName(zoneId)
      }));

      bulkOperation.initializeDomains(domains);
      setShowProgressModal(true);

      // Store the action type and enabled state for the operation
      setAction('proxy');
      setSelectedRules(enabled ? ['enabled'] : ['disabled']);
      return;
    }

    // Check if we should use the new modal for firewall operations
    if ((actionType === 'underAttack' || actionType === 'botFight') && useNewFirewallModal) {
      // Use new modal system for firewall operations
      const domains = selectedDomains.map(zoneId => ({
        zoneId,
        domainName: getDomainName(zoneId)
      }));

      bulkOperation.initializeDomains(domains);
      setShowProgressModal(true);

      // Store the action type and enabled state for the operation
      setAction(actionType);
      setSelectedRules(enabled ? ['enabled'] : ['disabled']);
      return;
    }

    // Use the original callback functions (that already work) for all other operations
    if (confirm(`¿Confirma ${actionName} en ${selectedDomains.length} dominios seleccionados?`)) {
      (async () => {
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
        }
      })();
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

  if (!selectedDomains || !Array.isArray(selectedDomains) || selectedDomains.length === 0) {
    return null;
  }

  return (
    <>
      <div className="flex items-center gap-4 p-4 bg-muted rounded-lg border">
        <div className="text-sm font-medium">
          {selectedDomains.length} dominios seleccionados
        </div>

        {/* Development toggles for new modals */}
        <div className="flex gap-3 text-xs">
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={useNewDNSModal}
              onChange={(e) => setUseNewDNSModal(e.target.checked)}
              className="w-3 h-3"
            />
            Modal DNS
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={useNewFirewallModal}
              onChange={(e) => setUseNewFirewallModal(e.target.checked)}
              className="w-3 h-3"
            />
            Modal Firewall
          </label>
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
            onClick={handleConfirmAction}
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

      <BulkOperationProgressModal
        isOpen={showProgressModal}
        onClose={handleCloseModal}
        title={getModalTitle()}
        domains={bulkOperation.domains}
        onStart={handleStartOperation}
        onCancel={bulkOperation.cancelOperation}
        canCancel={bulkOperation.canCancel}
        progress={bulkOperation.progress}
        isStarted={bulkOperation.isStarted}
        isCompleted={bulkOperation.isCompleted}
        summary={bulkOperation.summary}
      />
    </>
  );
}
