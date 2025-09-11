'use client';

import { useState, useEffect } from 'react';
import { DomainTable } from '@/components/domain-table';
import SecurityRulesManager from '@/components/SecurityRulesManager';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Key, Shield, Globe, CheckCircle, XCircle, Clock, AlertTriangle, Eye } from 'lucide-react';
import Image from 'next/image';

export default function Home() {
  const [apiToken, setApiToken] = useState('');
  const [isTokenSet, setIsTokenSet] = useState(false);
  const [loadingToken, setLoadingToken] = useState(true);
  const [testResults, setTestResults] = useState<any>(null);
  const [testingToken, setTestingToken] = useState(false);
  const [showChangeTokenDialog, setShowChangeTokenDialog] = useState(false);

  useEffect(() => {
    // Check if token exists in .env on component mount
    const loadExistingToken = async () => {
      try {
        const response = await fetch('/api/token');
        const data = await response.json();
        if (data.token) {
          setApiToken(data.token);
          setIsTokenSet(true);
        }
      } catch (error) {
        console.error('Error loading token:', error);
      } finally {
        setLoadingToken(false);
      }
    };

    loadExistingToken();
  }, []);


  const confirmResetToken = () => {
    setApiToken('');
    setIsTokenSet(false);
    setTestResults(null);
    setShowChangeTokenDialog(false);
  };

  const runTokenTest = async () => {
    if (!apiToken.trim()) return;

    try {
      setTestingToken(true);
      const response = await fetch('/api/test-token', {
        headers: {
          'x-api-token': apiToken.trim()
        }
      });

      const result = await response.json();
      setTestResults(result);
    } catch (error) {
      console.error('Error testing token:', error);
      setTestResults({
        success: false,
        error: 'Error al probar el token'
      });
    } finally {
      setTestingToken(false);
    }
  };

  const getStatusIcon = (success: boolean) => {
    return success ? (
      <CheckCircle className="h-5 w-5 text-green-600" />
    ) : (
      <XCircle className="h-5 w-5 text-red-600" />
    );
  };

  const getStatusBadge = (success: boolean) => {
    return (
      <Badge variant={success ? "default" : "destructive"}>
        {success ? "✓ OK" : "✗ Error"}
      </Badge>
    );
  };

  if (loadingToken) {
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

  return (
    <div className="container mx-auto py-8 px-4">
      {!isTokenSet ? (
        <div className="max-w-4xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Key className="h-8 w-8" />
              Configuración API Cloudflare
            </h1>
            <p className="text-muted-foreground mt-2">
              Configura y verifica tu token API de Cloudflare para gestionar dominios y reglas de seguridad
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Configuración del Token</CardTitle>
              <CardDescription>
                Ingresa tu token API de Cloudflare para probar los permisos
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="token">Token API de Cloudflare</Label>
                <Input
                  id="token"
                  type="password"
                  placeholder="Pega tu token aquí..."
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  className="font-mono"
                />
                {apiToken && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Token: ***{apiToken.slice(-8)}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Button onClick={runTokenTest} disabled={testingToken || !apiToken} className="flex-1">
                  {testingToken ? (
                    <>
                      <Clock className="h-4 w-4 mr-2 animate-spin" />
                      Probando...
                    </>
                  ) : (
                    'Probar Token'
                  )}
                </Button>
                <Button 
                  onClick={async () => {
                    if (!apiToken.trim()) return;
                    try {
                      await fetch('/api/token', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ token: apiToken.trim() }),
                      });
                      setIsTokenSet(true);
                    } catch (error) {
                      console.error('Error saving token:', error);
                    }
                  }} 
                  disabled={!apiToken} 
                  variant="outline"
                >
                  Guardar Token
                </Button>
              </div>
            </CardContent>
          </Card>

          {testResults && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Resultados del Test</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {testResults.success ? (
                    <>
                      {/* Zones Test */}
                      <div className="flex items-center justify-between p-3 border rounded">
                        <div className="flex items-center gap-3">
                          {getStatusIcon(testResults.data.zones?.success)}
                          <div>
                            <div className="font-medium">Acceso a Zonas</div>
                            <div className="text-sm text-muted-foreground">
                              {testResults.data.zones?.success 
                                ? `${testResults.data.zones.count} zonas encontradas`
                                : testResults.data.zones?.error
                              }
                            </div>
                          </div>
                        </div>
                        {getStatusBadge(testResults.data.zones?.success)}
                      </div>

                      {/* Rulesets Test */}
                      <div className="flex items-center justify-between p-3 border rounded">
                        <div className="flex items-center gap-3">
                          {getStatusIcon(testResults.data.rulesets?.success)}
                          <div>
                            <div className="font-medium">Acceso a Rulesets (Reglas de Seguridad)</div>
                            <div className="text-sm text-muted-foreground">
                              {testResults.data.rulesets?.success 
                                ? `${testResults.data.rulesets.totalRules || 0} reglas totales en ${testResults.data.rulesets.totalZonesAnalyzed || 0} zonas analizadas`
                                : testResults.data.rulesets?.error
                              }
                            </div>
                          </div>
                        </div>
                        {getStatusBadge(testResults.data.rulesets?.success)}
                      </div>

                      {/* Accounts Test */}
                      <div className="flex items-center justify-between p-3 border rounded">
                        <div className="flex items-center gap-3">
                          {getStatusIcon(testResults.data.accounts?.success)}
                          <div>
                            <div className="font-medium">Cuentas Disponibles</div>
                            <div className="text-sm text-muted-foreground">
                              {testResults.data.accounts?.success 
                                ? `${testResults.data.accounts.count} cuenta(s) detectada(s)`
                                : testResults.data.accounts?.error
                              }
                            </div>
                          </div>
                        </div>
                        {getStatusBadge(testResults.data.accounts?.success)}
                      </div>

                      {/* Token Verification */}
                      <div className="flex items-center justify-between p-3 border rounded">
                        <div className="flex items-center gap-3">
                          {getStatusIcon(testResults.data.tokenVerification?.success)}
                          <div>
                            <div className="font-medium">Verificación de Token</div>
                            <div className="text-sm text-muted-foreground">
                              {testResults.data.tokenVerification?.success 
                                ? 'Token válido y autenticado'
                                : testResults.data.tokenVerification?.error
                              }
                            </div>
                          </div>
                        </div>
                        {getStatusBadge(testResults.data.tokenVerification?.success)}
                      </div>

                      {/* Available Accounts */}
                      {testResults.data.accounts?.accounts && testResults.data.accounts.accounts.length > 0 && (
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-lg">Cuentas Disponibles</CardTitle>
                            <CardDescription>
                              Cuentas de Cloudflare a las que tienes acceso con este token
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-2">
                              {testResults.data.accounts.accounts.map((account: any, index: number) => (
                                <div key={index} className="flex items-center justify-between p-3 border rounded">
                                  <div>
                                    <div className="font-medium">{account.name}</div>
                                    <div className="text-xs text-muted-foreground font-mono">{account.id}</div>
                                  </div>
                                  <Badge variant={account.type === 'standard' ? 'default' : 'secondary'}>
                                    {account.type}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {/* Zone Details */}
                      {testResults.data.rulesets?.zoneDetails && testResults.data.rulesets.zoneDetails.length > 0 && (
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-lg">Desglose por Zonas/Dominios</CardTitle>
                            <CardDescription>
                              Reglas de seguridad encontradas por cada dominio/zona analizada
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-3">
                              {testResults.data.rulesets.zoneDetails.map((zone: any, index: number) => (
                                <div key={index} className="p-3 border rounded">
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <div className="font-mono text-sm font-medium">{zone.name}</div>
                                      <div className="text-xs text-muted-foreground">
                                        {zone.error 
                                          ? `Error: ${zone.error}`
                                          : `${zone.rulesCount || 0} reglas de seguridad • ${zone.customRulesetsCount || 0} rulesets custom`
                                        }
                                      </div>
                                    </div>
                                    <Badge variant={zone.error ? "destructive" : zone.rulesCount > 0 ? "default" : "secondary"}>
                                      {zone.error ? "Error" : zone.rulesCount > 0 ? `${zone.rulesCount} reglas` : "Sin reglas"}
                                    </Badge>
                                  </div>
                                </div>
                              ))}
                              {testResults.data.rulesets.totalZonesAvailable > testResults.data.rulesets.totalZonesAnalyzed && (
                                <div className="text-xs text-muted-foreground text-center p-2">
                                  * Se analizaron {testResults.data.rulesets.totalZonesAnalyzed} de {testResults.data.rulesets.totalZonesAvailable} zonas disponibles
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {/* Custom Rulesets */}
                      {testResults.data.rulesets?.customRulesets && testResults.data.rulesets.customRulesets.length > 0 && (
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-lg">Rulesets Custom Firewall (Utilizables)</CardTitle>
                            <CardDescription>
                              Estos son los rulesets donde se pueden crear y gestionar reglas personalizadas
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-2">
                              {testResults.data.rulesets.customRulesets.map((ruleset: any, index: number) => (
                                <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                                  <div>
                                    <span className="font-mono text-sm">{ruleset.name}</span>
                                    <div className="text-xs text-muted-foreground">
                                      {ruleset.rulesCount} reglas en {ruleset.zoneName}
                                    </div>
                                  </div>
                                  <Badge variant="default">{ruleset.phase}</Badge>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {/* Recommendations */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                            Recomendaciones
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          {!testResults.data.rulesets?.success ? (
                            <div className="space-y-2">
                              <p className="text-sm">Para que las reglas de seguridad funcionen, tu token necesita estos permisos:</p>
                              <ul className="text-sm space-y-1 ml-4">
                                <li>• Zone:Zone:Read</li>
                                <li>• Zone:Firewall Services:Read</li>
                                <li>• Zone:Firewall Services:Edit</li>
                              </ul>
                            </div>
                          ) : (
                            <p className="text-sm text-green-600">
                              ¡Perfecto! Tu token tiene todos los permisos necesarios para las reglas de seguridad.
                            </p>
                          )}
                        </CardContent>
                      </Card>

                      {/* Continue Button if test is successful */}
                      {testResults.data.zones?.success && (
                        <div className="flex justify-center pt-4">
                          <Button 
                            onClick={async () => {
                              try {
                                await fetch('/api/token', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ token: apiToken.trim() }),
                                });
                                setIsTokenSet(true);
                              } catch (error) {
                                console.error('Error saving token:', error);
                              }
                            }}
                            size="lg"
                            className="px-8"
                          >
                            Continuar con este Token
                          </Button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-red-600">
                      Error: {testResults.error}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Image
                src="/logo-rollpix.png"
                alt="Rollpix"
                width={180}
                height={60}
                className="h-12 w-auto"
              />
              <div className="text-sm text-muted-foreground">
                Cloudflare Manager
              </div>
            </div>
            <Button onClick={() => setShowChangeTokenDialog(true)} variant="outline" size="sm">
              Cambiar Token API
            </Button>
          </div>

          <Tabs defaultValue="domains" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="domains" className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Gestión de Dominios
              </TabsTrigger>
              <TabsTrigger value="security" className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Reglas de Seguridad
              </TabsTrigger>
            </TabsList>

            <TabsContent value="domains" className="space-y-4">
              <DomainTable apiToken={apiToken} />
            </TabsContent>

            <TabsContent value="security" className="space-y-4">
              <SecurityRulesManager apiToken={apiToken} />
            </TabsContent>
          </Tabs>
        </div>
      )}
      
      {/* Change Token Confirmation Dialog */}
      <Dialog open={showChangeTokenDialog} onOpenChange={setShowChangeTokenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar Token API</DialogTitle>
            <DialogDescription>
              ¿Estás seguro que deseas cambiar tu token API? Esto te llevará de vuelta a la pantalla de configuración.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowChangeTokenDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmResetToken} variant="destructive">
              Cambiar Token
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}