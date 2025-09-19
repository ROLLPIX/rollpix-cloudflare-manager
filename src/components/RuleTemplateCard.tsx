'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Trash2, Edit2, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { RuleTemplate } from '@/types/cloudflare';
import { useState } from 'react';

interface RuleTemplateCardProps {
  template: RuleTemplate;
  isUpdating: boolean;
  usageStats?: { domainCount: number; domains: string[] };
  onEdit: (template: RuleTemplate) => void;
  onUpdateAll: (template: RuleTemplate) => void;
  onDelete: (templateId: string) => void;
}

export function RuleTemplateCard({
  template,
  isUpdating,
  usageStats,
  onEdit,
  onUpdateAll,
  onDelete,
}: RuleTemplateCardProps) {
  const [showExpression, setShowExpression] = useState(false);

  return (
    <Card className="relative">
      <CardContent className="p-4">
        {/* Primera línea: Info principal + Controles */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="font-mono font-semibold">
              {template.friendlyId}
            </Badge>
            <span className="font-medium text-base">{template.name}</span>
            <span className="text-muted-foreground">•</span>
            <Badge variant="outline" className="text-xs">
              v{template.version}
            </Badge>
            <span className="text-muted-foreground">•</span>
            <Badge variant={template.enabled ? "default" : "secondary"} className="text-xs">
              {template.enabled ? 'Activa' : 'Inactiva'}
            </Badge>
            <span className="text-muted-foreground">•</span>
            <Badge variant="outline" className="text-xs">
              {template.action}
            </Badge>
            {usageStats && (
              <>
                <span className="text-muted-foreground">•</span>
                <Badge
                  variant={usageStats.domainCount > 0 ? "default" : "secondary"}
                  className="text-xs"
                  title={usageStats.domainCount > 0 ? `Usada en: ${usageStats.domains.join(', ')}` : "No se usa en ningún dominio"}
                >
                  {usageStats.domainCount === 0 ? 'Sin uso' : `${usageStats.domainCount} dominio${usageStats.domainCount > 1 ? 's' : ''}`}
                </Badge>
              </>
            )}
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(template)}
              title="Editar plantilla"
              className="h-8 w-8 p-0"
            >
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onUpdateAll(template)}
              disabled={isUpdating}
              title="Actualizar en todos los dominios que tengan versiones anteriores"
              className="h-8 w-8 p-0"
            >
              {isUpdating ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(template.id)}
              title="Eliminar plantilla"
              className="h-8 w-8 p-0"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Segunda línea: Descripción + Toggle expresión */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {template.description}
            </span>
            {template.tags.length > 0 && (
              <>
                <span className="text-muted-foreground">•</span>
                <span className="text-xs text-muted-foreground">
                  {template.tags.join(', ')}
                </span>
              </>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowExpression(!showExpression)}
            className="h-6 text-xs text-muted-foreground hover:text-foreground"
          >
            {showExpression ? (
              <>
                <ChevronDown className="h-3 w-3 mr-1" />
                Ocultar expresión
              </>
            ) : (
              <>
                <ChevronRight className="h-3 w-3 mr-1" />
                Ver expresión
              </>
            )}
          </Button>
        </div>

        {/* Expresión colapsible */}
        {showExpression && (
          <div className="mt-3 p-3 bg-muted rounded-md">
            <code className="block text-xs break-all whitespace-pre-wrap text-muted-foreground">
              {template.expression}
            </code>
          </div>
        )}
      </CardContent>
    </Card>
  );
}