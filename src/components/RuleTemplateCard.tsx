'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Trash2, Edit2, RefreshCw } from 'lucide-react';
import { RuleTemplate } from '@/types/cloudflare';
import { CollapsibleExpression } from './CollapsibleExpression';

interface RuleTemplateCardProps {
  template: RuleTemplate;
  isUpdating: boolean;
  onEdit: (template: RuleTemplate) => void;
  onUpdateAll: (template: RuleTemplate) => void;
  onDelete: (templateId: string) => void;
}

export function RuleTemplateCard({
  template,
  isUpdating,
  onEdit,
  onUpdateAll,
  onDelete,
}: RuleTemplateCardProps) {
  return (
    <Card className="relative">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="font-mono">
              {template.friendlyId}
            </Badge>
            <CardTitle className="text-lg">{template.name}</CardTitle>
            <Badge variant={template.enabled ? "default" : "secondary"}>
              {template.enabled ? 'Activa' : 'Inactiva'}
            </Badge>
            <Badge variant="outline">v{template.version}</Badge>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(template)}
              title="Editar plantilla"
            >
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onUpdateAll(template)}
              disabled={isUpdating}
              title="Actualizar en todos los dominios que tengan versiones anteriores"
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
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="outline" className="font-mono text-xs">
            ID: {template.id}
          </Badge>
        </div>
        <CardDescription>{template.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <CollapsibleExpression expression={template.expression} />
        <div className="flex items-center gap-4">
          <Badge>{template.action}</Badge>
          <div className="text-sm text-muted-foreground">
            {template.tags.length > 0 && (
              <span>Tags: {template.tags.join(', ')}</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}