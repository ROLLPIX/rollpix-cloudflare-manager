'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Loader2, X } from 'lucide-react';

interface ProgressPopupProps {
  isVisible: boolean;
  percentage: number;
  phase?: 1 | 2;
  phaseLabel?: string;
  current?: number;
  total?: number;
  currentBatch?: number;
  totalBatches?: number;
  currentDomainName?: string;
  isWaitingRateLimit?: boolean;
  onCancel?: () => void;
}

export function ProgressPopup({
  isVisible,
  percentage,
  phase,
  phaseLabel,
  current,
  total,
  currentBatch,
  totalBatches,
  currentDomainName,
  isWaitingRateLimit,
  onCancel
}: ProgressPopupProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !isVisible) {
    return null;
  }

  const getPhaseInfo = () => {
    if (!phase) {
      return {
        title: 'Actualizando dominios',
        subtitle: `${percentage}% completado`,
        details: null
      };
    }

    if (phase === 1) {
      return {
        title: 'Fase 1: Obteniendo lista de dominios',
        subtitle: `${percentage}% completado`,
        details: null
      };
    }

    // Fase 2 - Mostrar información detallada
    const domainInfo = current && total ? ` (${current}/${total})` : '';
    const batchInfo = currentBatch && totalBatches ? `Lote ${currentBatch}/${totalBatches}` : '';
    const domainNameInfo = currentDomainName ? `Procesando: ${currentDomainName}` : '';
    const rateLimitInfo = isWaitingRateLimit ? '⏳ Esperando por límites de rate...' : '';

    return {
      title: `Fase 2: Procesando reglas de seguridad ${domainInfo}`,
      subtitle: `${percentage}% completado`,
      details: batchInfo || domainNameInfo || rateLimitInfo ? { batchInfo, domainNameInfo, rateLimitInfo } : null
    };
  };

  const info = getPhaseInfo();

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-2">
      <Card className="w-[28rem] shadow-lg border-2">
        <CardContent className="p-4">
          <div className="flex items-start gap-3 mb-3">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600 mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-medium">
                {info.title}
              </div>
              <div className="text-xs text-muted-foreground">
                {info.subtitle}
              </div>
              {info.details && (
                <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                  {info.details.batchInfo && (
                    <div className="font-medium text-blue-600">{info.details.batchInfo}</div>
                  )}
                  {info.details.domainNameInfo && (
                    <div className="truncate">{info.details.domainNameInfo}</div>
                  )}
                  {info.details.rateLimitInfo && (
                    <div className="font-medium text-orange-600">{info.details.rateLimitInfo}</div>
                  )}
                </div>
              )}
            </div>
            {onCancel && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-gray-500 hover:text-red-600 hover:bg-red-50"
                onClick={onCancel}
                title="Cancelar actualización"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          <Progress value={percentage} />

          {phase && (
            <div className="mt-2 text-xs text-center text-muted-foreground">
              Fase {phase} de 2
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
