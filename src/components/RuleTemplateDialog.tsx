'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RuleTemplate } from '@/types/cloudflare';

interface RuleTemplateDialogProps {
  isOpen: boolean;
  isEdit: boolean;
  formData: {
    name: string;
    description: string;
    expression: string;
    action: RuleTemplate['action'];
  };
  onFormChange: (field: string, value: string) => void;
  onSave: () => void;
  onClose: () => void;
}

export function RuleTemplateDialog({
  isOpen,
  isEdit,
  formData,
  onFormChange,
  onSave,
  onClose,
}: RuleTemplateDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Editar Plantilla' : 'Crear Nueva Plantilla'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Modifica la plantilla de regla de seguridad'
              : 'Define una nueva plantilla de regla de seguridad'
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor={isEdit ? "edit-rule-name" : "rule-name"}>Nombre</Label>
              <Input
                id={isEdit ? "edit-rule-name" : "rule-name"}
                value={formData.name}
                onChange={(e) => onFormChange('name', e.target.value)}
                placeholder="Nombre de la regla"
              />
            </div>
            <div>
              <Label htmlFor={isEdit ? "edit-rule-action" : "rule-action"}>Acción</Label>
              <Select
                value={formData.action}
                onValueChange={(value) => onFormChange('action', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="block">Block</SelectItem>
                  <SelectItem value="challenge">Challenge</SelectItem>
                  <SelectItem value="allow">Allow</SelectItem>
                  <SelectItem value="log">Log</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor={isEdit ? "edit-rule-description" : "rule-description"}>Descripción</Label>
            <Textarea
              id={isEdit ? "edit-rule-description" : "rule-description"}
              value={formData.description}
              onChange={(e) => onFormChange('description', e.target.value)}
              placeholder="Descripción de la regla"
            />
          </div>

          <div>
            <Label htmlFor={isEdit ? "edit-rule-expression" : "rule-expression"}>Expresión de Cloudflare</Label>
            <Textarea
              id={isEdit ? "edit-rule-expression" : "rule-expression"}
              value={formData.expression}
              onChange={(e) => onFormChange('expression', e.target.value)}
              placeholder='(ip.geoip.country in {"CN" "RU"}) or (http.user_agent contains "bot")'
              className="font-mono text-sm min-h-[100px] max-h-[300px] overflow-y-auto resize-y"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={onSave}
            disabled={!formData.name || !formData.expression}
          >
            {isEdit ? 'Actualizar Plantilla' : 'Crear Plantilla'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}