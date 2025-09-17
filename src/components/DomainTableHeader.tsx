'use client';

import { Globe, RefreshCw } from 'lucide-react';
import { CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface DomainTableHeaderProps {
  totalCount: number;
  processedCount: number;
  loading: boolean;
  isBackgroundRefreshing: boolean;
  onRefresh: () => void;
}

export function DomainTableHeader({
  totalCount,
  processedCount,
  loading,
  isBackgroundRefreshing,
  onRefresh,
}: DomainTableHeaderProps) {
  const formatLastUpdate = (date: Date) => {
    return date.toLocaleString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <CardHeader>
      <div className="flex items-center justify-between">
        <CardTitle className="flex items-center gap-3">
          <Globe className="h-5 w-5" />
          Mis dominios
          <span className="text-sm font-normal text-muted-foreground">
            ({processedCount} de {totalCount} dominios)
          </span>
        </CardTitle>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={loading || isBackgroundRefreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading || isBackgroundRefreshing ? 'animate-spin' : ''}`} />
              {loading ? 'Actualizando...' : 'Actualizar Todo'}
            </Button>
          </div>
          <div className="flex items-center gap-2 h-4">
            {isBackgroundRefreshing && <Loader2 className="h-3 w-3 animate-spin" />}
            <span className="text-xs text-muted-foreground">
              Últ. actualización: {formatLastUpdate(new Date())}
            </span>
          </div>
        </div>
      </div>
    </CardHeader>
  );
}