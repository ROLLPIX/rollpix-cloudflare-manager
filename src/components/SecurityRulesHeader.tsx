'use client';

import { useState } from 'react';
import { Shield, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { tokenStorage } from '@/lib/tokenStorage';
import { toast } from 'sonner';

interface SecurityRulesHeaderProps {
  templateCount: number;
  onCreateNew: () => void;
}

export function SecurityRulesHeader({ templateCount, onCreateNew }: SecurityRulesHeaderProps) {
  const [isAutoDetecting, setIsAutoDetecting] = useState(false);

  const handleAutoDetect = async () => {
    const apiToken = tokenStorage.getToken();
    if (!apiToken) {
      toast.error('API Token no encontrado. Configure su token primero.');
      return;
    }

    try {
      setIsAutoDetecting(true);
      const response = await fetch('/api/templates/auto-detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiToken, forceRefresh: false })
      });

      const result = await response.json();

      if (result.success) {
        const { imported, updated, newTemplates } = result.data;
        toast.success(`Auto-detección completada: ${imported} plantillas importadas, ${updated} actualizadas`);

        // Refresh templates list if new templates were added
        if (imported > 0 || updated > 0) {
          // Force reload of templates
          window.location.reload();
        }
      } else {
        toast.error(result.error || 'Error en auto-detección de plantillas');
      }
    } catch (error) {
      console.error('Error in template auto-detection:', error);
      toast.error('Error al ejecutar auto-detección de plantillas');
    } finally {
      setIsAutoDetecting(false);
    }
  };
  return (
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Shield className="h-6 w-6" />
          Plantillas de Reglas de Seguridad
        </h2>
        <p className="text-muted-foreground">
          Gestiona plantillas de reglas que se pueden aplicar a múltiples dominios
        </p>
      </div>
      <div className="flex gap-2">
        <Button onClick={onCreateNew}>
          <Plus className="h-4 w-4 mr-2" />
          Nueva Plantilla
        </Button>
        <Button
          variant="outline"
          onClick={handleAutoDetect}
          disabled={isAutoDetecting}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isAutoDetecting ? 'animate-spin' : ''}`} />
          Auto-detectar Plantillas
        </Button>
      </div>
    </div>
  );
}