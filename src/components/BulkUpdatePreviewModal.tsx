'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle, Clock, RefreshCw } from 'lucide-react';
import { RuleTemplate } from '@/types/cloudflare';

interface DomainPreview {
  zoneId: string;
  domain: string;
  currentVersion?: string;
  action: 'update' | 'add' | 'skip';
  reason?: string;
}

interface BulkUpdatePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  template: RuleTemplate;
  domains: DomainPreview[];
  isUpdating: boolean;
}

export function BulkUpdatePreviewModal({
  isOpen,
  onClose,
  onConfirm,
  template,
  domains,
  isUpdating
}: BulkUpdatePreviewModalProps) {
  const [confirmed, setConfirmed] = useState(false);

  const stats = {
    toUpdate: domains.filter(d => d.action === 'update').length,
    toAdd: domains.filter(d => d.action === 'add').length,
    toSkip: domains.filter(d => d.action === 'skip').length,
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'update':
        return <RefreshCw className="h-4 w-4 text-blue-600" />;
      case 'add':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'skip':
        return <Clock className="h-4 w-4 text-gray-600" />;
      default:
        return null;
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'update':
        return <Badge variant="default" className="bg-blue-100 text-blue-800">Actualizar</Badge>;
      case 'add':
        return <Badge variant="default" className="bg-green-100 text-green-800">Agregar</Badge>;
      case 'skip':
        return <Badge variant="secondary">Omitir</Badge>;
      default:
        return null;
    }
  };

  const handleConfirm = () => {
    if (!confirmed) {
      setConfirmed(true);
      return;
    }

    onConfirm();
    setConfirmed(false);
  };

  const handleClose = () => {
    setConfirmed(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-600" />
            Confirmar Actualización Masiva
          </DialogTitle>
          <DialogDescription>
            Revisa los cambios que se van a realizar antes de confirmar la actualización de la plantilla{' '}
            <Badge variant="outline">{template.friendlyId}</Badge> {template.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template Info */}
          <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
            <h4 className="font-medium mb-2">Plantilla a actualizar:</h4>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="secondary">{template.friendlyId}</Badge>
              <span className="font-medium">{template.name}</span>
              <Badge variant="outline">v{template.version}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{template.description}</p>
          </div>

          {/* Statistics */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-lg text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.toUpdate}</div>
              <div className="text-sm text-blue-700">A actualizar</div>
            </div>
            <div className="bg-green-50 dark:bg-green-950 p-3 rounded-lg text-center">
              <div className="text-2xl font-bold text-green-600">{stats.toAdd}</div>
              <div className="text-sm text-green-700">A agregar</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg text-center">
              <div className="text-2xl font-bold text-gray-600">{stats.toSkip}</div>
              <div className="text-sm text-gray-700">A omitir</div>
            </div>
          </div>

          {/* Domain List */}
          <div>
            <h4 className="font-medium mb-2">Dominios afectados ({domains.length}):</h4>
            <div className="h-64 border rounded-lg overflow-y-auto">
              <div className="p-4 space-y-2">
                {domains.map((domain) => (
                  <div key={domain.zoneId} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-900 rounded">
                    <div className="flex items-center gap-2">
                      {getActionIcon(domain.action)}
                      <span className="font-medium">{domain.domain}</span>
                      {domain.currentVersion && (
                        <Badge variant="outline" className="text-xs">
                          v{domain.currentVersion}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {getActionBadge(domain.action)}
                      {domain.reason && (
                        <span className="text-xs text-muted-foreground">{domain.reason}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Warning */}
          <div className="bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 p-3 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-orange-900 dark:text-orange-100">
                  Esta acción no se puede deshacer
                </p>
                <p className="text-orange-700 dark:text-orange-300 mt-1">
                  Se actualizarán {stats.toUpdate + stats.toAdd} dominios. Asegúrate de que la nueva versión de la regla sea correcta.
                </p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isUpdating}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isUpdating}
            className={confirmed ? "bg-red-600 hover:bg-red-700" : ""}
          >
            {isUpdating ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Actualizando...
              </>
            ) : confirmed ? (
              'Confirmar Actualización'
            ) : (
              'Revisar y Confirmar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}