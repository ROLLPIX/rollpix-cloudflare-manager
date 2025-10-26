'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Loader2 } from 'lucide-react';

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
  currentDomainName
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
    const domainInfo = current && total ? ` (${current}/${total} dominios)` : '';
    const batchInfo = currentBatch && totalBatches ? `Lote ${currentBatch}/${totalBatches}` : '';
    const domainNameInfo = currentDomainName ? `Procesando: ${currentDomainName}` : '';

    return {
      title: `Fase 2: Procesando reglas de seguridad${domainInfo}`,
      subtitle: `${percentage}% completado`,
      details: batchInfo || domainNameInfo ? { batchInfo, domainNameInfo } : null
    };
  };

  const info = getPhaseInfo();

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-2">
      <Card className="w-96 shadow-lg border-2">
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
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
                </div>
              )}
            </div>
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
