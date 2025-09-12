'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface CollapsibleExpressionProps {
  expression: string;
  label?: string;
  defaultCollapsed?: boolean;
}

export function CollapsibleExpression({ 
  expression, 
  label = "Expresión:", 
  defaultCollapsed = true 
}: CollapsibleExpressionProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  return (
    <div className="bg-muted p-3 rounded-md">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{label}</Label>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="h-6 w-6 p-0"
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
      </div>
      {!isCollapsed && (
        <code className="block text-sm mt-2 break-all whitespace-pre-wrap">
          {expression}
        </code>
      )}
    </div>
  );
}