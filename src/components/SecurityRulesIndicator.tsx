'use client';

import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Shield, ShieldOff, AlertTriangle, Settings } from 'lucide-react';
import { DomainStatus } from '@/types/cloudflare';
import { DomainRulesModal } from './DomainRulesModal';
import { tokenStorage } from '@/lib/tokenStorage';

interface SecurityRulesIndicatorProps {
  domain: DomainStatus;
  compact?: boolean;
}

export function SecurityRulesIndicator({ domain, compact = false }: SecurityRulesIndicatorProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const securityRules = domain.securityRules;


  if (!securityRules) {
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
                  if (tokenStorage.getToken()) {
                    setModalOpen(true);
                  }
                }}
              >
                <ShieldOff className="h-4 w-4 text-muted-foreground" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Reglas no analizadas - Click para cargar</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  const renderSimplified = () => {
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
                  if (tokenStorage.getToken()) {
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
              <p>
                {securityRules.totalRules === 0
                  ? 'Sin reglas de seguridad - Click para configurar'
                  : 'Ver reglas de seguridad de este dominio'
                }
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {securityRules.templateRules && securityRules.templateRules.length > 0 && (
          securityRules.templateRules.map((rule) => (
            <TooltipProvider key={rule.friendlyId}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className={`text-xs px-1.5 py-0.5 ${
                      rule.isOutdated
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : 'bg-green-50 text-green-700 border-green-200'
                    }`}
                  >
                    {rule.friendlyId}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {rule.isOutdated
                      ? 'Esta regla tiene una versión desactualizada'
                      : `${rule.name} v${rule.version}`
                    }
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))
        )}

        {securityRules.customRules > 0 && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-xs px-1.5 py-0.5 text-blue-600">
                  {securityRules.customRules} custom
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>{securityRules.customRules} reglas personalizadas</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

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
      {renderSimplified()}
      
      {tokenStorage.getToken() && (
        <DomainRulesModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          zoneId={domain.zoneId}
          domainName={domain.domain}
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
  const totalWithCustomRules = domains.filter(domain => domain.securityRules && domain.securityRules.customRules > 0).length;
  const totalWithAnyRules = domains.filter(domain => domain.securityRules && domain.securityRules.totalRules > 0).length;

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
        <div className="flex gap-2 text-xs flex-wrap">
          <Badge variant="outline" className="text-green-600">
            {totalWithAnyRules} con reglas
          </Badge>
          {totalWithCorporateRules > 0 && (
            <Badge variant="outline" className="text-purple-600">
              {totalWithCorporateRules} corporativas
            </Badge>
          )}
          {totalWithCustomRules > 0 && (
            <Badge variant="outline" className="text-blue-600">
              {totalWithCustomRules} personalizadas
            </Badge>
          )}
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
