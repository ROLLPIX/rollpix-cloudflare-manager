'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { RulePillData } from '@/types/cloudflare';

interface RulePillProps {
  rule: RulePillData;
  domainId: string;
}

export function RulePill({ rule, domainId }: RulePillProps) {
  const isUpdated = rule.isUpdated;
  const hasVersionMismatch = rule.domainVersion && rule.domainVersion !== rule.version;

  // Determine pill color based on status
  const getPillStyle = () => {
    if (isUpdated) {
      return 'bg-green-100 text-green-800 border-green-200 hover:bg-green-200';
    } else {
      return 'bg-red-100 text-red-800 border-red-200 hover:bg-red-200';
    }
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const getTypeEmoji = (type: string) => {
    switch (type) {
      case 'firewall_custom':
        return '🛡️';
      case 'rate_limiting':
        return '⏱️';
      default:
        return '🔧';
    }
  };

  const getActionEmoji = (action: string) => {
    switch (action) {
      case 'block':
        return '🚫';
      case 'challenge':
        return '❓';
      case 'managed_challenge':
        return '🛡️';
      case 'allow':
        return '✅';
      case 'log':
        return '📝';
      default:
        return '⚙️';
    }
  };

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={`text-xs px-2 py-1 cursor-help transition-colors ${getPillStyle()}`}
          >
            {rule.id}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-lg p-4 text-sm">
          <div className="space-y-2">
            <div className="font-semibold text-base border-b pb-2 break-words">
              📋 Regla {rule.id} - {rule.name}
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-600">🔖 ID:</span>
                <div className="font-medium">{rule.id}</div>
              </div>

              <div>
                <span className="text-gray-600">📝 Nombre:</span>
                <div className="font-medium">{rule.name}</div>
              </div>

              <div>
                <span className="text-gray-600">🏷️ Versión:</span>
                <div className="font-medium">
                  {rule.version}
                  {hasVersionMismatch && (
                    <span className="text-red-600 text-xs block">
                      (dominio: {rule.domainVersion})
                    </span>
                  )}
                </div>
              </div>

              <div>
                <span className="text-gray-600">🎯 Acción:</span>
                <div className="font-medium">
                  {getActionEmoji(rule.action)} {rule.action}
                </div>
              </div>

              <div>
                <span className="text-gray-600">🛡️ Tipo:</span>
                <div className="font-medium">
                  {getTypeEmoji(rule.type)} {rule.type}
                </div>
              </div>

              <div>
                <span className="text-gray-600">📅 Actualizada:</span>
                <div className="font-medium text-xs">
                  {formatDate(rule.lastUpdated)}
                </div>
              </div>
            </div>

            <div className="pt-2 border-t">
              <span className="text-gray-600">📜 Expression:</span>
              <div className="mt-1 p-2 bg-gray-50 rounded text-xs font-mono break-all">
                {rule.expression}
              </div>
            </div>

            {!isUpdated && (
              <div className="pt-2 border-t">
                <div className="text-red-600 text-xs font-medium">
                  ⚠️ Esta regla necesita actualización
                </div>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface RulePillsDisplayProps {
  rules: RulePillData[];
  domainId: string;
  className?: string;
}

export function RulePillsDisplay({ rules, domainId, className = '' }: RulePillsDisplayProps) {
  if (!rules || rules.length === 0) {
    return (
      <div className={`text-xs text-gray-500 ${className}`}>
        Sin reglas
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {rules.map((rule) => (
        <RulePill
          key={`${domainId}-${rule.id}`}
          rule={rule}
          domainId={domainId}
        />
      ))}
    </div>
  );
}