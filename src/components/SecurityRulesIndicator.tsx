'use client';

import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Shield, ShieldOff, AlertTriangle, Clock, CheckCircle, Settings } from 'lucide-react';
import { DomainStatus } from '@/types/cloudflare';
import { DomainRulesModal } from './DomainRulesModal';

interface SecurityRulesIndicatorProps {
  domain: DomainStatus;
  compact?: boolean;
  apiToken?: string;
}

export function SecurityRulesIndicator({ domain, compact = false, apiToken }: SecurityRulesIndicatorProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [templateRules, setTemplateRules] = useState<string[]>([]);
  const [rulesLoaded, setRulesLoaded] = useState(false);
  const securityRules = domain.securityRules;

  // Load template rules when component has security rules data
  const loadTemplateRules = async () => {
    if (!apiToken || !domain.zoneId || rulesLoaded) return;
    
    try {
      const response = await fetch(`/api/domains/rules/${domain.zoneId}`, {
        headers: { 'x-api-token': apiToken }
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          const friendlyIds = result.data.templateRules.map((rule: any) => rule.friendlyId);
          setTemplateRules(friendlyIds);
          setRulesLoaded(true);
        }
      }
    } catch (error) {
      console.error('Error loading template rules:', error);
    }
  };

  // Load template rules when security rules are available
  React.useEffect(() => {
    if (securityRules && securityRules.corporateRules > 0 && !rulesLoaded) {
      loadTemplateRules();
    }
  }, [securityRules, rulesLoaded]);

  if (!securityRules) {
    return (
      <div className="flex items-center gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="outline" 
                size="sm"
                className="h-8 px-2"
                onClick={() => {
                  if (apiToken) {
                    loadTemplateRules();
                    setModalOpen(true);
                  }
                }}
              >
                <ShieldOff className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Sin reglas de seguridad - Click para configurar</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  // New format with pills + custom counter
  const renderNewFormat = () => {
    return (
      <div className="flex items-center gap-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="outline" 
                size="sm"
                className="h-8 px-2"
                onClick={() => {
                  if (apiToken) {
                    if (!rulesLoaded) {
                      loadTemplateRules();
                    }
                    setModalOpen(true);
                  }
                }}
              >
                {securityRules.totalRules === 0 ? (
                  <ShieldOff className="h-4 w-4" />
                ) : (
                  <Shield className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{securityRules.totalRules === 0 ? 'Sin reglas de seguridad - Click para configurar' : 'Ver reglas de seguridad de este dominio'}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Template rules pills */}
        {templateRules.slice(0, 3).map((friendlyId, index) => (
          <Badge key={index} variant="secondary" className="text-xs px-1.5 py-0.5">
            {friendlyId}
          </Badge>
        ))}
        
        {/* Show +X for remaining template rules */}
        {templateRules.length > 3 && (
          <Badge variant="outline" className="text-xs px-1.5 py-0.5">
            +{templateRules.length - 3}
          </Badge>
        )}

        {/* Custom rules counter */}
        {securityRules.customRules > 0 && (
          <Badge variant="outline" className="text-xs px-1.5 py-0.5 text-blue-600">
            +{securityRules.customRules}
          </Badge>
        )}

        {/* Conflict indicator */}
        {securityRules.hasConflicts && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Conflictos detectados en las reglas</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    );
  };

  return (
    <>
      {renderNewFormat()}
      
      {apiToken && (
        <DomainRulesModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          zoneId={domain.zoneId}
          domainName={domain.domain}
          apiToken={apiToken}
        />
      )}
    </>
  );
}

interface SecurityRulesColumnProps {
  domains: DomainStatus[];
  onAnalyzeSecurityRules?: () => void;
  loading?: boolean;
}

export function SecurityRulesColumn({ domains, onAnalyzeSecurityRules, loading }: SecurityRulesColumnProps) {
  const hasSecurityData = domains.some(domain => domain.securityRules !== undefined);
  const totalWithConflicts = domains.filter(domain => domain.securityRules?.hasConflicts).length;
  const totalWithCorporateRules = domains.filter(domain => domain.securityRules && domain.securityRules.corporateRules > 0).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Reglas de Seguridad</div>
        {onAnalyzeSecurityRules && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onAnalyzeSecurityRules}
            disabled={loading}
          >
            <Shield className="h-3 w-3 mr-1" />
            Analizar
          </Button>
        )}
      </div>
      
      {hasSecurityData && (
        <div className="flex gap-2 text-xs">
          <Badge variant="outline" className="text-green-600">
            {totalWithCorporateRules} con reglas corporativas
          </Badge>
          {totalWithConflicts > 0 && (
            <Badge variant="destructive">
              {totalWithConflicts} con conflictos
            </Badge>
          )}
        </div>
      )}
      
      {!hasSecurityData && (
        <div className="text-xs text-muted-foreground">
          Haz clic en "Analizar" para revisar las reglas de seguridad
        </div>
      )}
    </div>
  );
}