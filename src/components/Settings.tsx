'use client';

import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Key,
  Palette,
  Gauge,
  Info,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  RotateCcw,
  LogOut,
  Trash2
} from 'lucide-react';
import { tokenStorage } from '@/lib/tokenStorage';
import { settingsStorage } from '@/lib/settingsStorage';

interface SettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTokenChange?: () => void;
  onLogout?: () => void;
}

export function Settings({ open, onOpenChange, onTokenChange, onLogout }: SettingsProps) {
  const [activeTab, setActiveTab] = useState('token');
  const [testingToken, setTestingToken] = useState(false);
  const [testResults, setTestResults] = useState<any>(null);
  const [showTokenChangeWarning, setShowTokenChangeWarning] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);

  const tokenInputRef = useRef<HTMLInputElement>(null);

  // Rate limiting settings
  const [batchSize, setBatchSize] = useState(4);
  const [batchDelay, setBatchDelay] = useState(6000);

  // Theme setting
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');

  // Load settings on mount
  useEffect(() => {
    if (open) {
      const settings = settingsStorage.getSettings();
      setBatchSize(settings.apiRateLimiting.batchSize);
      setBatchDelay(settings.apiRateLimiting.batchDelay);
      setTheme(settings.theme);
    }
  }, [open]);

  const runTokenTest = async () => {
    const token = tokenInputRef.current?.value.trim();
    if (!token) return;

    try {
      setTestingToken(true);
      const response = await fetch('/api/test-token', {
        headers: { 'x-api-token': token }
      });
      const result = await response.json();
      setTestResults(result);
    } catch (error) {
      console.error('Error testing token:', error);
      setTestResults({ success: false, error: 'Error al probar el token' });
    } finally {
      setTestingToken(false);
    }
  };

  const saveToken = async () => {
    const token = tokenInputRef.current?.value.trim();
    if (!token) return;

    if (!tokenStorage.isValidTokenFormat(token)) {
      setTestResults({
        success: false,
        error: 'Formato de token inválido. El token debe tener al menos 40 caracteres.',
      });
      return;
    }

    try {
      // Check if token is different
      const currentToken = tokenStorage.getToken();
      const isTokenChanged = currentToken !== token;

      tokenStorage.setToken(token);

      // Clear cache if token changed
      if (isTokenChanged) {
        console.log('[Settings] Token changed, clearing cache...');
        await fetch('/api/cache/clear', { method: 'POST' });
      }

      setTestResults(null);
      onTokenChange?.();
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving token:', error);
      setTestResults({
        success: false,
        error: 'Error al guardar el token. Intenta de nuevo.',
      });
    }
  };

  const handleLogout = () => {
    tokenStorage.clearToken();
    onLogout?.();
    onOpenChange(false);
  };

  const saveRateLimitingSettings = () => {
    settingsStorage.setRateLimiting(batchSize, batchDelay);

    // Show success feedback
    const successMessage = document.createElement('div');
    successMessage.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
    successMessage.textContent = 'Configuración guardada';
    document.body.appendChild(successMessage);
    setTimeout(() => successMessage.remove(), 2000);
  };

  const saveTheme = (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
    settingsStorage.setTheme(newTheme);

    // Apply theme immediately
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (newTheme === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      // System preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  };

  const resetToDefaults = () => {
    settingsStorage.resetToDefaults();
    const defaults = settingsStorage.getSettings();
    setBatchSize(defaults.apiRateLimiting.batchSize);
    setBatchDelay(defaults.apiRateLimiting.batchDelay);
    setTheme(defaults.theme);
    saveTheme(defaults.theme);
  };

  const handleClearCache = async () => {
    if (!confirm('¿Estás seguro de que deseas vaciar la caché? Esto eliminará todos los dominios y reglas almacenadas.')) {
      return;
    }

    try {
      setClearingCache(true);
      console.log('[Settings] Clearing cache manually...');

      const response = await fetch('/api/cache/clear', { method: 'POST' });
      const result = await response.json();

      if (result.success) {
        // Show success feedback
        const successMessage = document.createElement('div');
        successMessage.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
        successMessage.textContent = 'Caché vaciada correctamente';
        document.body.appendChild(successMessage);
        setTimeout(() => successMessage.remove(), 2000);

        // Trigger reload if callback provided
        onTokenChange?.();
      } else {
        throw new Error(result.error || 'Error al vaciar la caché');
      }
    } catch (error) {
      console.error('Error clearing cache:', error);
      const errorMessage = document.createElement('div');
      errorMessage.className = 'fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
      errorMessage.textContent = 'Error al vaciar la caché';
      document.body.appendChild(errorMessage);
      setTimeout(() => errorMessage.remove(), 2000);
    } finally {
      setClearingCache(false);
    }
  };

  const getStatusIcon = (success: boolean) => {
    return success ? <CheckCircle className="h-5 w-5 text-green-600" /> : <XCircle className="h-5 w-5 text-red-600" />;
  };

  const getStatusBadge = (success: boolean) => {
    return <Badge variant={success ? "default" : "destructive"}>{success ? "✓ OK" : "✗ Error"}</Badge>;
  };

  const storedToken = tokenStorage.getToken();
  const tokenAge = tokenStorage.getTokenAge();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gauge className="h-5 w-5" />
            Configuración
          </DialogTitle>
          <DialogDescription>
            Gestiona tu token API, preferencias de tema y configuración de rate limiting
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="token" className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              Token API
            </TabsTrigger>
            <TabsTrigger value="theme" className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Tema
            </TabsTrigger>
            <TabsTrigger value="api" className="flex items-center gap-2">
              <Gauge className="h-4 w-4" />
              Rate Limiting
            </TabsTrigger>
          </TabsList>

          {/* TOKEN TAB */}
          <TabsContent value="token" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Token API de Cloudflare</CardTitle>
                <CardDescription>
                  Gestiona tu token de autenticación para la API de Cloudflare
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {storedToken && (
                  <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm">
                        <p className="font-medium text-blue-900 dark:text-blue-100">Token actual</p>
                        <p className="text-blue-700 dark:text-blue-300 font-mono">***{storedToken.slice(-8)}</p>
                        {tokenAge !== null && (
                          <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                            Guardado: {tokenAge === 0 ? 'Ahora' : `hace ${tokenAge}h`}
                          </p>
                        )}
                      </div>
                      <Button onClick={handleLogout} variant="destructive" size="sm">
                        <LogOut className="h-4 w-4 mr-2" />
                        Cerrar Sesión
                      </Button>
                    </div>
                  </div>
                )}

                <Separator />

                <div className="space-y-4">
                  <div>
                    <Label>Gestión de Datos</Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Vacía la caché para forzar una recarga completa de los dominios y reglas
                    </p>
                    <Button
                      onClick={handleClearCache}
                      disabled={clearingCache}
                      variant="outline"
                      className="w-full border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-700 dark:hover:text-red-300"
                    >
                      {clearingCache ? (
                        <>
                          <Clock className="h-4 w-4 mr-2 animate-spin" />
                          Vaciando caché...
                        </>
                      ) : (
                        <>
                          <Trash2 className="h-4 w-4 mr-2" />
                          Vaciar Caché
                        </>
                      )}
                    </Button>
                  </div>

                  <Separator />

                  <div>
                    <Label htmlFor="token-input">Nuevo Token API</Label>
                    <Input
                      id="token-input"
                      type="password"
                      placeholder="Pega tu token de Cloudflare aquí..."
                      ref={tokenInputRef}
                      className="font-mono"
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={runTokenTest} disabled={testingToken} className="flex-1">
                      {testingToken ? (
                        <>
                          <Clock className="h-4 w-4 mr-2 animate-spin" />
                          Probando...
                        </>
                      ) : (
                        'Probar Token'
                      )}
                    </Button>
                    <Button onClick={saveToken} variant="outline">
                      <Key className="h-4 w-4 mr-2" />
                      Guardar Token
                    </Button>
                  </div>

                  {testResults && (
                    <div className="space-y-3 mt-4">
                      {testResults.success ? (
                        <>
                          <div className="flex items-center justify-between p-3 border rounded">
                            <div className="flex items-center gap-3">
                              {getStatusIcon(testResults.data.zones?.success)}
                              <div>
                                <div className="font-medium">Acceso a Zonas</div>
                                <div className="text-sm text-muted-foreground">
                                  {testResults.data.zones?.success
                                    ? `${testResults.data.zones.count} zonas encontradas`
                                    : testResults.data.zones?.error}
                                </div>
                              </div>
                            </div>
                            {getStatusBadge(testResults.data.zones?.success)}
                          </div>
                          <div className="flex items-center justify-between p-3 border rounded">
                            <div className="flex items-center gap-3">
                              {getStatusIcon(testResults.data.rulesets?.success)}
                              <div>
                                <div className="font-medium">Acceso a Rulesets</div>
                                <div className="text-sm text-muted-foreground">
                                  {testResults.data.rulesets?.success
                                    ? `${testResults.data.rulesets.totalRules || 0} reglas en ${testResults.data.rulesets.totalZonesAnalyzed || 0} zonas`
                                    : testResults.data.rulesets?.error}
                                </div>
                              </div>
                            </div>
                            {getStatusBadge(testResults.data.rulesets?.success)}
                          </div>
                        </>
                      ) : (
                        <div className="text-red-600 p-3 border border-red-200 rounded">
                          Error: {testResults.error}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium text-amber-900 dark:text-amber-100">Cambiar token borrará la caché</p>
                      <p className="text-amber-700 dark:text-amber-300 mt-1">
                        Al cambiar el token API, se eliminarán automáticamente todos los datos almacenados (dominios, reglas) ya que pueden pertenecer a otra cuenta de Cloudflare.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* THEME TAB */}
          <TabsContent value="theme" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Preferencia de Tema</CardTitle>
                <CardDescription>
                  Personaliza el aspecto de la aplicación
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Tema de la interfaz</Label>
                  <Select value={theme} onValueChange={(value: any) => saveTheme(value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona un tema" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">Claro</SelectItem>
                      <SelectItem value="dark">Oscuro</SelectItem>
                      <SelectItem value="system">Sistema (automático)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    El tema se aplicará inmediatamente y se guardará para futuras sesiones.
                  </p>
                </div>

                <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium text-blue-900 dark:text-blue-100">Modo Sistema</p>
                      <p className="text-blue-700 dark:text-blue-300 mt-1">
                        El modo Sistema se ajustará automáticamente según la preferencia de tema de tu sistema operativo.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* API RATE LIMITING TAB */}
          <TabsContent value="api" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Configuración de Rate Limiting</CardTitle>
                <CardDescription>
                  Ajusta cómo la aplicación consume la API de Cloudflare para evitar límites
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="batch-size">
                      Tamaño del Lote (Batch Size)
                      <span className="text-xs text-muted-foreground ml-2">Dominios procesados en paralelo</span>
                    </Label>
                    <Input
                      id="batch-size"
                      type="number"
                      min="1"
                      max="12"
                      value={batchSize}
                      onChange={(e) => setBatchSize(parseInt(e.target.value) || 4)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Recomendado: 4-6. Valores más altos = más rápido pero mayor riesgo de límites.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="batch-delay">
                      Espera entre Lotes (ms)
                      <span className="text-xs text-muted-foreground ml-2">Milisegundos de pausa</span>
                    </Label>
                    <Input
                      id="batch-delay"
                      type="number"
                      min="500"
                      max="15000"
                      step="500"
                      value={batchDelay}
                      onChange={(e) => setBatchDelay(parseInt(e.target.value) || 6000)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Recomendado: 5000-8000ms (5-8 segundos). Valores más altos = más lento pero más seguro.
                    </p>
                  </div>

                  <Button onClick={saveRateLimitingSettings} className="w-full">
                    Guardar Configuración de API
                  </Button>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <div className="flex items-start gap-2">
                      <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                      <div className="text-sm">
                        <p className="font-medium text-blue-900 dark:text-blue-100">Límites de Cloudflare</p>
                        <p className="text-blue-700 dark:text-blue-300 mt-1">
                          Cloudflare permite <strong>1200 requests por 5 minutos</strong>. Cada dominio requiere ~7 llamadas API.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3">
                    <div className="text-sm">
                      <p className="font-medium text-green-900 dark:text-green-100">Configuración Actual</p>
                      <div className="text-green-700 dark:text-green-300 mt-2 space-y-1">
                        <p>• Batch Size: {batchSize} dominios en paralelo</p>
                        <p>• Delay: {batchDelay}ms ({(batchDelay / 1000).toFixed(1)}s) entre lotes</p>
                        <p>• Estimado: ~{Math.ceil(110 / batchSize)} lotes para 110 dominios</p>
                        <p>• Tiempo total: ~{Math.ceil((110 / batchSize) * (batchDelay / 1000))}s</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between items-center">
              <Button onClick={resetToDefaults} variant="outline" size="sm">
                <RotateCcw className="h-4 w-4 mr-2" />
                Restaurar Valores por Defecto
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
