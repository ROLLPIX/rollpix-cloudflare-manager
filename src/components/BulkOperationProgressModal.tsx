'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, CheckCircle, AlertCircle, X, Play } from 'lucide-react';

interface BulkOperationDomain {
  zoneId: string;
  domainName: string;
  status?: 'pending' | 'processing' | 'success' | 'error';
  message?: string;
  error?: string;
}

interface BulkOperationProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  domains: BulkOperationDomain[];
  onStart: () => Promise<void>;
  onCancel?: () => void;
  canCancel?: boolean;
  progress?: number;
  isStarted?: boolean;
  isCompleted?: boolean;
  summary?: {
    total: number;
    successful: number;
    failed: number;
  };
  phase?: {
    current: 'api_calls' | 'verification' | 'cache_refresh';
    description: string;
    progress: number;
  };
}

export function BulkOperationProgressModal({
  isOpen,
  onClose,
  title,
  domains,
  onStart,
  onCancel,
  canCancel = true,
  progress = 0,
  isStarted = false,
  isCompleted = false,
  summary,
  phase
}: BulkOperationProgressModalProps) {
  const [localDomains, setLocalDomains] = useState<BulkOperationDomain[]>(domains);

  // Update local domains when props change
  useEffect(() => {
    setLocalDomains(domains);
  }, [domains]);

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'processing':
        return <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline">Pendiente</Badge>;
      case 'processing':
        return <Badge variant="default">Procesando...</Badge>;
      case 'success':
        return <Badge variant="default" className="bg-green-500">Completado</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="outline">En espera</Badge>;
    }
  };

  const handleClose = () => {
    if (isStarted && !isCompleted && canCancel) {
      // Show confirmation for cancellation
      if (confirm('¿Está seguro de que desea cancelar la operación en progreso?')) {
        onCancel?.();
        onClose();
      }
    } else {
      onClose();
    }
  };

  if (isStarted) {
    // Show progress view
    return (
      <Dialog open={isOpen} onOpenChange={() => {}}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>{title}</DialogTitle>
              {canCancel && !isCompleted && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClose}
                  className="ml-2"
                >
                  <X className="h-4 w-4 mr-1" />
                  Cancelar
                </Button>
              )}
            </div>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progreso: {Math.round(progress)}%</span>
                {summary && (
                  <span>
                    {summary.successful} éxitos, {summary.failed} errores de {summary.total} total
                  </span>
                )}
              </div>
              <Progress value={progress} className="w-full" />

              {/* Phase indicator */}
              {phase && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    {phase.current === 'api_calls' && <RefreshCw className="h-3 w-3 animate-spin" />}
                    {phase.current === 'verification' && <CheckCircle className="h-3 w-3" />}
                    {phase.current === 'cache_refresh' && <RefreshCw className="h-3 w-3" />}
                    <span className="font-medium">
                      {phase.current === 'api_calls' && 'Fase 1/3:'}
                      {phase.current === 'verification' && 'Fase 2/3:'}
                      {phase.current === 'cache_refresh' && 'Fase 3/3:'}
                    </span>
                  </div>
                  <span>{phase.description}</span>
                </div>
              )}

              {/* Phase progress bar */}
              {phase && (
                <div className="space-y-1">
                  <div className="flex gap-1">
                    <div className={`h-1 flex-1 rounded ${
                      phase.current === 'api_calls' ? 'bg-blue-500' :
                      phase.progress > 20 ? 'bg-green-500' : 'bg-gray-200'
                    }`} />
                    <div className={`h-1 flex-1 rounded ${
                      phase.current === 'verification' ? 'bg-blue-500' :
                      phase.progress > 80 ? 'bg-green-500' : 'bg-gray-200'
                    }`} />
                    <div className={`h-1 flex-1 rounded ${
                      phase.current === 'cache_refresh' ? 'bg-blue-500' :
                      phase.progress === 100 ? 'bg-green-500' : 'bg-gray-200'
                    }`} />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>API Calls</span>
                    <span>Verificación</span>
                    <span>Cache</span>
                  </div>
                </div>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto space-y-2 border rounded-lg p-2">
              {localDomains.map((domain) => (
                <div key={domain.zoneId} className="flex items-center justify-between p-3 border rounded-lg bg-card">
                  <div className="flex items-center gap-3 flex-1">
                    {getStatusIcon(domain.status)}
                    <div className="flex flex-col">
                      <span className="font-medium">{domain.domainName}</span>
                      {domain.message && (
                        <span className="text-sm text-muted-foreground">{domain.message}</span>
                      )}
                      {domain.error && (
                        <span className="text-sm text-red-500">{domain.error}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    {getStatusBadge(domain.status)}
                  </div>
                </div>
              ))}
            </div>

            {isCompleted && summary && (
              <div className="flex justify-center mt-4">
                <Button onClick={onClose}>
                  Cerrar
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Show confirmation view
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
            <p className="text-sm">
              Esta operación afectará <strong>{domains.length} dominios</strong>.
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium">Dominios que serán procesados:</h4>
            <div className="max-h-48 overflow-y-auto space-y-1 border rounded-lg p-2">
              {domains.map((domain) => (
                <div key={domain.zoneId} className="flex items-center justify-between p-2 bg-muted rounded text-sm">
                  <span className="font-medium">{domain.domainName}</span>
                  <Badge variant="outline">Listo</Badge>
                </div>
              ))}
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            ¿Desea proceder con esta operación?
          </p>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={onStart}>
            <Play className="h-4 w-4 mr-2" />
            Iniciar Operación
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}