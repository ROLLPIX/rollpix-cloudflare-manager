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
import { SimpleThemeToggle } from '@/components/SimpleThemeToggle';
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
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2"><Key className="h-8 w-8" />Configuración API Cloudflare</h1>
            </div>
            <SimpleThemeToggle />
          </div>
          <div>
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
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-4">
                {/* Rollpix logo - switch between dark and light mode */}
                <Image
                  src="/logo-rollpix-blanco.png"
                  alt="Rollpix"
                  width={180}
                  height={60}
                  className="h-12 w-auto dark:block hidden"
                />
                <Image
                  src="/logo-rollpix.png"
                  alt="Rollpix"
                  width={180}
                  height={60}
                  className="h-12 w-auto dark:hidden block"
                />

                {/* Cloudflare logo - switch between dark and light mode */}
                {/* Light mode - black text */}
                <svg viewBox="0 0 105 36" role="img" width="105px" height="41px" aria-hidden="true" className="dark:hidden block">
                  <path fill="#000" d="M11.679 26.754h2.353v6.423h4.111v2.06H11.68v-8.483zM20.58 31.02v-.024c0-2.436 1.965-4.412 4.584-4.412 2.62 0 4.56 1.951 4.56 4.387v.025c0 2.436-1.965 4.41-4.584 4.41-2.618 0-4.56-1.95-4.56-4.386zm6.743 0v-.024c0-1.223-.885-2.291-2.183-2.291-1.285 0-2.147 1.042-2.147 2.266v.025c0 1.222.886 2.29 2.171 2.29 1.298 0 2.159-1.042 2.159-2.266zM32.604 31.517v-4.763h2.389v4.714c0 1.223.618 1.806 1.564 1.806.946 0 1.564-.557 1.564-1.745v-4.775h2.39v4.7c0 2.74-1.564 3.939-3.978 3.939s-3.93-1.223-3.93-3.878M44.112 26.755h3.274c3.032 0 4.79 1.744 4.79 4.192v.025c0 2.447-1.782 4.265-4.838 4.265h-3.226v-8.483zm3.31 6.397c1.408 0 2.34-.775 2.34-2.146v-.024c0-1.357-.932-2.145-2.34-2.145h-.958v4.316l.959-.001zM55.596 26.754h6.791v2.06h-4.438v1.442h4.014v1.951h-4.014v3.03h-2.353v-8.483zM65.661 26.754h2.353v6.423h4.111v2.06h-6.464v-8.483zM78.273 26.693h2.268l3.614 8.544h-2.522l-.62-1.515H77.74l-.606 1.515h-2.474l3.614-8.544zm2.062 5.2l-.946-2.413-.959 2.412h1.905zM87.186 26.754H91.2c1.298 0 2.195.34 2.765.921.498.485.752 1.14.752 1.976v.024c0 1.296-.693 2.156-1.746 2.605l2.025 2.957H92.28l-1.71-2.57h-1.03v2.57h-2.353v-8.483zm3.905 4.072c.8 0 1.262-.388 1.262-1.006v-.024c0-.667-.486-1.006-1.275-1.006h-1.54v2.038l1.553-.002zM98.112 26.754h6.827v2h-4.498v1.284h4.075v1.854h-4.075v1.346H105v1.999h-6.888v-8.483zM6.528 32.014c-.33.744-1.023 1.272-1.944 1.272-1.286 0-2.171-1.067-2.171-2.29v-.025c0-1.223.86-2.266 2.146-2.266.97 0 1.708.595 2.02 1.406h2.48c-.398-2.02-2.173-3.526-4.475-3.526-2.62 0-4.584 1.977-4.584 4.41v.024c0 2.436 1.94 4.388 4.56 4.388 2.24 0 3.991-1.45 4.453-3.393H6.528z"></path>
                  <path d="M89.012 22.355l.257-.887c.306-1.056.192-2.031-.321-2.748-.472-.66-1.259-1.049-2.214-1.094l-18.096-.229a.358.358 0 01-.285-.151.367.367 0 01-.04-.326.481.481 0 01.42-.321l18.263-.232c2.166-.099 4.512-1.856 5.333-3.998L93.37 9.65a.659.659 0 00.028-.36C92.216 3.975 87.468 0 81.792 0c-5.23 0-9.67 3.373-11.263 8.061a5.34 5.34 0 00-3.756-1.039 5.356 5.356 0 00-4.637 6.644c-4.099.12-7.386 3.475-7.386 7.6 0 .368.028.735.082 1.1a.354.354 0 00.348.305l33.408.004h.009a.44.44 0 00.415-.32z" fill="#F6821F"></path>
                  <path d="M95.04 9.847c-.167 0-.334.004-.5.013a.28.28 0 00-.079.017.285.285 0 00-.182.192l-.712 2.456c-.305 1.055-.192 2.03.322 2.746.471.661 1.258 1.05 2.213 1.094l3.858.232a.351.351 0 01.275.149.365.365 0 01.041.328.484.484 0 01-.42.32l-4.008.232c-2.176.1-4.521 1.856-5.342 3.998l-.29.756a.212.212 0 00.095.262c.03.017.062.027.096.028h13.802a.366.366 0 00.356-.265 9.846 9.846 0 00.367-2.677c-.001-5.457-4.429-9.88-9.891-9.88z" fill="#FBAD41"></path>
                </svg>

                {/* Dark mode - white text */}
                <svg viewBox="0 0 105 36" role="img" width="105px" height="41px" aria-hidden="true" className="dark:block hidden">
                  <path fill="#fff" d="M11.679 26.754h2.353v6.423h4.111v2.06H11.68v-8.483zM20.58 31.02v-.024c0-2.436 1.965-4.412 4.584-4.412 2.62 0 4.56 1.951 4.56 4.387v.025c0 2.436-1.965 4.41-4.584 4.41-2.618 0-4.56-1.95-4.56-4.386zm6.743 0v-.024c0-1.223-.885-2.291-2.183-2.291-1.285 0-2.147 1.042-2.147 2.266v.025c0 1.222.886 2.29 2.171 2.29 1.298 0 2.159-1.042 2.159-2.266zM32.604 31.517v-4.763h2.389v4.714c0 1.223.618 1.806 1.564 1.806.946 0 1.564-.557 1.564-1.745v-4.775h2.39v4.7c0 2.74-1.564 3.939-3.978 3.939s-3.93-1.223-3.93-3.878M44.112 26.755h3.274c3.032 0 4.79 1.744 4.79 4.192v.025c0 2.447-1.782 4.265-4.838 4.265h-3.226v-8.483zm3.31 6.397c1.408 0 2.34-.775 2.34-2.146v-.024c0-1.357-.932-2.145-2.34-2.145h-.958v4.316l.959-.001zM55.596 26.754h6.791v2.06h-4.438v1.442h4.014v1.951h-4.014v3.03h-2.353v-8.483zM65.661 26.754h2.353v6.423h4.111v2.06h-6.464v-8.483zM78.273 26.693h2.268l3.614 8.544h-2.522l-.62-1.515H77.74l-.606 1.515h-2.474l3.614-8.544zm2.062 5.2l-.946-2.413-.959 2.412h1.905zM87.186 26.754H91.2c1.298 0 2.195.34 2.765.921.498.485.752 1.14.752 1.976v.024c0 1.296-.693 2.156-1.746 2.605l2.025 2.957H92.28l-1.71-2.57h-1.03v2.57h-2.353v-8.483zm3.905 4.072c.8 0 1.262-.388 1.262-1.006v-.024c0-.667-.486-1.006-1.275-1.006h-1.54v2.038l1.553-.002zM98.112 26.754h6.827v2h-4.498v1.284h4.075v1.854h-4.075v1.346H105v1.999h-6.888v-8.483zM6.528 32.014c-.33.744-1.023 1.272-1.944 1.272-1.286 0-2.171-1.067-2.171-2.29v-.025c0-1.223.86-2.266 2.146-2.266.97 0 1.708.595 2.02 1.406h2.48c-.398-2.02-2.173-3.526-4.475-3.526-2.62 0-4.584 1.977-4.584 4.41v.024c0 2.436 1.94 4.388 4.56 4.388 2.24 0 3.991-1.45 4.453-3.393H6.528z"></path>
                  <path d="M89.012 22.355l.257-.887c.306-1.056.192-2.031-.321-2.748-.472-.66-1.259-1.049-2.214-1.094l-18.096-.229a.358.358 0 01-.285-.151.367.367 0 01-.04-.326.481.481 0 01.42-.321l18.263-.232c2.166-.099 4.512-1.856 5.333-3.998L93.37 9.65a.659.659 0 00.028-.36C92.216 3.975 87.468 0 81.792 0c-5.23 0-9.67 3.373-11.263 8.061a5.34 5.34 0 00-3.756-1.039 5.356 5.356 0 00-4.637 6.644c-4.099.12-7.386 3.475-7.386 7.6 0 .368.028.735.082 1.1a.354.354 0 00.348.305l33.408.004h.009a.44.44 0 00.415-.32z" fill="#F6821F"></path>
                  <path d="M95.04 9.847c-.167 0-.334.004-.5.013a.28.28 0 00-.079.017.285.285 0 00-.182.192l-.712 2.456c-.305 1.055-.192 2.03.322 2.746.471.661 1.258 1.05 2.213 1.094l3.858.232a.351.351 0 01.275.149.365.365 0 01.041.328.484.484 0 01-.42.32l-4.008.232c-2.176.1-4.521 1.856-5.342 3.998l-.29.756a.212.212 0 00.095.262c.03.017.062.027.096.028h13.802a.366.366 0 00.356-.265 9.846 9.846 0 00.367-2.677c-.001-5.457-4.429-9.88-9.891-9.88z" fill="#FBAD41"></path>
                </svg>
              </div>

            </div>
            <div className="flex items-center gap-2">
              <SimpleThemeToggle />
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
