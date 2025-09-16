'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Loader2 } from 'lucide-react';

interface ProgressPopupProps {
  isVisible: boolean;
  percentage: number;
}

export function ProgressPopup({ isVisible, percentage }: ProgressPopupProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !isVisible) {
    return null;
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-2">
      <Card className="w-80 shadow-lg border-2">
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            <div className="flex-1">
              <div className="text-sm font-medium">
                Actualizando dominios
              </div>
              <div className="text-xs text-muted-foreground">
                {percentage}% completado
              </div>
            </div>
          </div>

          <Progress value={percentage} />
        </CardContent>
      </Card>
    </div>
  );
}