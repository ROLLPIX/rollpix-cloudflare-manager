'use client';

import { Shield, Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface SecurityRulesEmptyStateProps {
  onCreateNew: () => void;
}

export function SecurityRulesEmptyState({ onCreateNew }: SecurityRulesEmptyStateProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-8 text-center">
        <Shield className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">No hay plantillas configuradas</h3>
        <p className="text-muted-foreground mb-4">
          Crea tu primera plantilla de regla de seguridad para comenzar
        </p>
        <Button onClick={onCreateNew}>
          <Plus className="h-4 w-4 mr-2" />
          Crear Primera Plantilla
        </Button>
      </CardContent>
    </Card>
  );
}