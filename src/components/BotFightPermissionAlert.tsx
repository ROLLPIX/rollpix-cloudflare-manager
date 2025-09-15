'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ExternalLink, Shield } from 'lucide-react';

interface BotFightPermissionAlertProps {
  show: boolean;
  onDismiss?: () => void;
}

export function BotFightPermissionAlert({ show, onDismiss }: BotFightPermissionAlertProps) {
  if (!show) return null;

  const handleOpenTokenPage = () => {
    window.open('https://dash.cloudflare.com/profile/api-tokens', '_blank');
  };

  const handleOpenDocumentation = () => {
    window.open('https://developers.cloudflare.com/fundamentals/api/get-started/create-token/', '_blank');
  };

  return (
    <Alert className="border-orange-200 bg-orange-50 dark:bg-orange-950 dark:border-orange-800">
      <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
      <AlertDescription className="space-y-3">
        <div>
          <p className="font-medium text-orange-900 dark:text-orange-100">
            🤖 Bot Fight Mode - Permisos Insuficientes
          </p>
          <p className="text-orange-700 dark:text-orange-300 mt-1">
            Tu token API no tiene permisos de <strong>"Bot Management Read/Write"</strong>.
            Bot Fight Mode no se puede leer ni controlar sin estos permisos específicos.
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-orange-900 dark:text-orange-100">
            ✅ Solución Rápida:
          </p>
          <ol className="text-sm text-orange-700 dark:text-orange-300 list-decimal list-inside space-y-1">
            <li>Ve a tu dashboard de Cloudflare → API Tokens</li>
            <li>Edita tu token actual o crea uno nuevo</li>
            <li>Agrega los permisos: <code className="bg-orange-100 dark:bg-orange-900 px-1 rounded">Bot Management:Read</code> y <code className="bg-orange-100 dark:bg-orange-900 px-1 rounded">Bot Management:Write</code></li>
            <li>Actualiza el token en esta aplicación</li>
          </ol>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={handleOpenTokenPage}
            className="bg-orange-600 hover:bg-orange-700 text-white"
          >
            <Shield className="h-3 w-3 mr-1" />
            Ir a API Tokens
            <ExternalLink className="h-3 w-3 ml-1" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleOpenDocumentation}
            className="border-orange-300 text-orange-700 hover:bg-orange-100"
          >
            Ver Documentación
            <ExternalLink className="h-3 w-3 ml-1" />
          </Button>
          {onDismiss && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onDismiss}
              className="text-orange-600 hover:bg-orange-100"
            >
              Cerrar
            </Button>
          )}
        </div>

        <div className="text-xs text-orange-600 dark:text-orange-400">
          💡 <strong>Tip:</strong> Los permisos de Bot Management son separados de los permisos de Zone WAF.
          Ambos son necesarios para funcionalidad completa.
        </div>
      </AlertDescription>
    </Alert>
  );
}