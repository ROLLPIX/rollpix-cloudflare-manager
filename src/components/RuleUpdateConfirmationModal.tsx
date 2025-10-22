'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { RuleTemplate } from '@/types/cloudflare';

interface AffectedDomain {
  zoneId: string;
  domainName: string;
  currentVersion: string;
  status?: 'pending' | 'updating' | 'success' | 'error';
  error?: string;
}

interface RuleUpdateConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  template: RuleTemplate;
  affectedDomains: AffectedDomain[];
  onConfirm: (updateDomains: boolean) => Promise<void>;
  onUpdateProgress?: (callback: (progress: number) => void) => void;
}

export function RuleUpdateConfirmationModal({
  isOpen,
  onClose,
  template,
  affectedDomains,
  onConfirm,
  onUpdateProgress
}: RuleUpdateConfirmationModalProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [domainStatuses, setDomainStatuses] = useState<AffectedDomain[]>(affectedDomains);
  const [showProgress, setShowProgress] = useState(false);

  // Register progress callback with the hook
  useEffect(() => {
    if (onUpdateProgress) {
      onUpdateProgress((progress: number) => {
        setUpdateProgress(progress);

        // Update domain statuses based on progress
        if (progress < 100) {
          const completedCount = Math.floor((progress / 100) * affectedDomains.length);
          setDomainStatuses(prev => prev.map((domain, index) => ({
            ...domain,
            status: index < completedCount ? 'success' :
                   index === completedCount ? 'updating' : 'pending'
          })));
        } else {
          // All completed
          setDomainStatuses(prev => prev.map(domain => ({ ...domain, status: 'success' })));
        }
      });
    }
  }, [onUpdateProgress, affectedDomains.length]);

  // Auto-close modal when progress reaches 100%
  useEffect(() => {
    if (updateProgress >= 100 && showProgress) {
      console.log('[RuleUpdateConfirmationModal] Progress reached 100%, closing modal in 2 seconds');
      const timer = setTimeout(() => {
        onClose();
        setIsUpdating(false);
        setShowProgress(false);
        setUpdateProgress(0);
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [updateProgress, showProgress, onClose]);

  const handleConfirm = async (updateDomains: boolean) => {
    if (updateDomains) {
      setIsUpdating(true);
      setShowProgress(true);

      try {
        // Initialize all domains as pending
        setDomainStatuses(prev => prev.map(domain => ({ ...domain, status: 'pending' })));

        await onConfirm(true);

        // Wait for progress to reach 100% before closing
        // This ensures all phases (apply rules + refresh domains) complete
        console.log('[RuleUpdateConfirmationModal] Operation completed, waiting for progress to reach 100%');

        // The progress callback will update updateProgress state
        // We'll close the modal after showing completion state briefly
        // Note: If progress doesn't reach 100%, modal will stay open (user can close manually)

      } catch (error) {
        console.error('Error updating domains:', error);
        setDomainStatuses(prev => prev.map(domain => ({
          ...domain,
          status: 'error',
          error: 'Failed to update'
        })));
        setIsUpdating(false);
      }
    } else {
      await onConfirm(false);
      onClose();
    }
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'updating':
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
      case 'updating':
        return <Badge variant="default">Actualizando...</Badge>;
      case 'success':
        return <Badge variant="default" className="bg-green-500">Actualizado</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="outline">Desactualizado</Badge>;
    }
  };

  if (showProgress) {
    return (
      <Dialog open={isOpen} onOpenChange={() => {}}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Actualizando dominios con {template.friendlyId} v{template.version}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <Progress value={updateProgress} className="w-full" />

            <div className="max-h-64 overflow-y-auto space-y-2">
              {domainStatuses.map((domain) => (
                <div key={domain.zoneId} className="flex items-center justify-between p-2 border rounded">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(domain.status)}
                    <span className="font-medium">{domain.domainName}</span>
                    <span className="text-sm text-muted-foreground">
                      v{domain.currentVersion} → v{template.version}
                    </span>
                  </div>
                  {getStatusBadge(domain.status)}
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Regla {template.friendlyId} actualizada a v{template.version}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
            <p className="text-sm">
              <strong>{affectedDomains.length} dominios</strong> tienen esta regla aplicada con versiones anteriores.
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium">Dominios afectados:</h4>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {affectedDomains.map((domain) => (
                <div key={domain.zoneId} className="flex items-center justify-between p-2 bg-muted rounded text-sm">
                  <span className="font-medium">{domain.domainName}</span>
                  <Badge variant="outline">
                    v{domain.currentVersion} → v{template.version}
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            ¿Desea actualizar estos dominios con la nueva versión de la regla?
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => handleConfirm(false)}
            disabled={isUpdating}
          >
            No actualizar
          </Button>
          <Button
            onClick={() => handleConfirm(true)}
            disabled={isUpdating}
          >
            {isUpdating ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Actualizando...
              </>
            ) : (
              'Sí, actualizar dominios'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}