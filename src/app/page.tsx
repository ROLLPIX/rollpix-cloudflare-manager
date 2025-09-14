'use client';

import { useState, useEffect, useRef } from 'react';
import { DomainTable } from '@/components/domain-table';
import SecurityRulesManager from '@/components/SecurityRulesManager';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Key, Shield, Globe, CheckCircle, XCircle, Clock, AlertTriangle, LogOut } from 'lucide-react';
import { tokenStorage } from '@/lib/tokenStorage';
import Image from 'next/image';

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [testResults, setTestResults] = useState<any>(null);
  const [testingToken, setTestingToken] = useState(false);
  const [showChangeTokenDialog, setShowChangeTokenDialog] = useState(false);
  const [renderKey, setRenderKey] = useState(0); // Used to force re-render on token change
  const tokenInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLoading(false);
  }, []);

  const forceRerender = () => setRenderKey(prev => prev + 1);

  const confirmResetToken = () => {
    tokenStorage.clearToken();
    setTestResults(null);
    setShowChangeTokenDialog(false);
    forceRerender();
  };

  const saveToken = () => {
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
      tokenStorage.setToken(token);
      setTestResults(null);
      forceRerender();
    } catch (error) {
      console.error('Error saving token:', error);
      setTestResults({
        success: false,
        error: 'Error al guardar el token. Intenta de nuevo.',
      });
    }
  };

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

  const getStatusIcon = (success: boolean) => {
    return success ? <CheckCircle className="h-5 w-5 text-green-600" /> : <XCircle className="h-5 w-5 text-red-600" />;
  };

  const getStatusBadge = (success: boolean) => {
    return <Badge variant={success ? "default" : "destructive"}>{success ? "✓ OK" : "✗ Error"}</Badge>;
  };

  if (loading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="flex items-center justify-center py-8">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
            Cargando...
          </div>
        </div>
      </div>
    );
  }

  const isTokenSet = tokenStorage.hasValidToken();
  const storedToken = tokenStorage.getToken();
  const tokenAge = tokenStorage.getTokenAge();

  return (
    <div className="container mx-auto py-8 px-4">
      {!isTokenSet ? (
        <div className="max-w-4xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2"><Key className="h-8 w-8" />Configuración API Cloudflare</h1>
            <p className="text-muted-foreground mt-2">Configura y verifica tu token API de Cloudflare para gestionar dominios y reglas de seguridad</p>
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mt-4">
              <div className="flex items-start gap-2">
                <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-blue-900 dark:text-blue-100">Seguridad del Token</p>
                  <p className="text-blue-700 dark:text-blue-300 mt-1">Tu token se almacena de forma segura en tu navegador (localStorage) y expira automáticamente después de 7 días. Solo tú tienes acceso a esta información en tu dispositivo.</p>
                </div>
              </div>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Configuración del Token</CardTitle>
              <CardDescription>Ingresa tu token API de Cloudflare para probar los permisos</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="token">Token API de Cloudflare</Label>
                <Input id="token" type="password" placeholder="Pega tu token aquí..." ref={tokenInputRef} className="font-mono" />
              </div>
              <div className="flex gap-2">
                <Button onClick={runTokenTest} disabled={testingToken} className="flex-1">
                  {testingToken ? <><Clock className="h-4 w-4 mr-2 animate-spin" />Probando...</> : 'Probar Token'}
                </Button>
                <Button onClick={saveToken} variant="outline"><Key className="h-4 w-4 mr-2" />Guardar Token</Button>
              </div>
            </CardContent>
          </Card>

          {testResults && (
            <div className="space-y-4">
              <Card>
                <CardHeader><CardTitle>Resultados del Test</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {testResults.success ? (
                    <>
                      <div className="flex items-center justify-between p-3 border rounded">
                        <div className="flex items-center gap-3">{getStatusIcon(testResults.data.zones?.success)}<div><div className="font-medium">Acceso a Zonas</div><div className="text-sm text-muted-foreground">{testResults.data.zones?.success ? `${testResults.data.zones.count} zonas encontradas` : testResults.data.zones?.error}</div></div></div>{getStatusBadge(testResults.data.zones?.success)}
                      </div>
                      <div className="flex items-center justify-between p-3 border rounded">
                        <div className="flex items-center gap-3">{getStatusIcon(testResults.data.rulesets?.success)}<div><div className="font-medium">Acceso a Rulesets (Reglas de Seguridad)</div><div className="text-sm text-muted-foreground">{testResults.data.rulesets?.success ? `${testResults.data.rulesets.totalRules || 0} reglas totales en ${testResults.data.rulesets.totalZonesAnalyzed || 0} zonas analizadas` : testResults.data.rulesets?.error}</div></div></div>{getStatusBadge(testResults.data.rulesets?.success)}
                      </div>
                      {testResults.data.zones?.success && (
                        <div className="flex justify-center pt-4">
                          <Button onClick={saveToken} size="lg" className="px-8">Continuar con este Token</Button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-red-600">Error: {testResults.error}</div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4" key={renderKey}>
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Image src="/logo-rollpix.png" alt="Rollpix" width={180} height={60} className="h-12 w-auto" />
              <div className="text-sm text-muted-foreground">Cloudflare Manager</div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-xs text-muted-foreground mr-2">
                <div>Token: ***{storedToken?.slice(-8)}</div>
                {tokenAge !== null && <div>Guardado: {tokenAge === 0 ? 'Ahora' : `hace ${tokenAge}h`}</div>}
              </div>
              <Button onClick={() => setShowChangeTokenDialog(true)} variant="outline" size="sm"><Key className="h-3 w-3 mr-1" />Cambiar Token</Button>
              <Button onClick={confirmResetToken} variant="destructive" size="sm"><LogOut className="h-3 w-3 mr-1" />Cerrar Sesión</Button>
            </div>
          </div>

          <Tabs defaultValue="domains" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="domains" className="flex items-center gap-2"><Globe className="h-4 w-4" />Gestión de Dominios</TabsTrigger>
              <TabsTrigger value="security" className="flex items-center gap-2"><Shield className="h-4 w-4" />Reglas de Seguridad</TabsTrigger>
            </TabsList>
            <TabsContent value="domains" className="space-y-4"><DomainTable /></TabsContent>
            <TabsContent value="security" className="space-y-4"><SecurityRulesManager /></TabsContent>
          </Tabs>
        </div>
      )}
      
      <Dialog open={showChangeTokenDialog} onOpenChange={setShowChangeTokenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar Token API</DialogTitle>
            <DialogDescription>¿Estás seguro que deseas cambiar tu token API? Esto te llevará de vuelta a la pantalla de configuración.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowChangeTokenDialog(false)}>Cancelar</Button>
            <Button onClick={confirmResetToken} variant="destructive">Cambiar Token</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
