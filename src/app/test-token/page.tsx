'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';

export default function TestTokenPage() {
  const [testResults, setTestResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [apiToken, setApiToken] = useState<string>('');

  useEffect(() => {
    // Try to get token from localStorage if available
    const token = localStorage.getItem('cloudflare-api-token');
    if (token) {
      setApiToken(token);
    }
  }, []);

  const runTest = async () => {
    if (!apiToken) {
      alert('Por favor ingresa tu token API');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch('/api/test-token', {
        headers: {
          'x-api-token': apiToken
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
      setLoading(false);
    }
  };

  const saveToken = async () => {
    if (!apiToken) {
      alert('Por favor ingresa un token');
      return;
    }

    try {
      const response = await fetch('/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: apiToken })
      });

      if (response.ok) {
        alert('Token guardado exitosamente');
      } else {
        alert('Error al guardar el token');
      }
    } catch (error) {
      console.error('Error saving token:', error);
      alert('Error al guardar el token');
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

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Configuración API Cloudflare</h1>
          <p className="text-muted-foreground">
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
              <Button onClick={runTest} disabled={loading || !apiToken} className="flex-1">
                {loading ? (
                  <>
                    <Clock className="h-4 w-4 mr-2 animate-spin" />
                    Probando...
                  </>
                ) : (
                  'Probar Token'
                )}
              </Button>
              <Button onClick={saveToken} disabled={!apiToken} variant="outline">
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
                              ? `${testResults.data.rulesets.count} rulesets total, ${testResults.data.rulesets.customRulesetsCount || 0} custom firewall`
                              : testResults.data.rulesets?.error
                            }
                          </div>
                        </div>
                      </div>
                      {getStatusBadge(testResults.data.rulesets?.success)}
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
                                  <div className="text-xs text-muted-foreground">{ruleset.rulesCount} reglas actuales</div>
                                </div>
                                <Badge variant="default">{ruleset.phase}</Badge>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* All Rulesets */}
                    {testResults.data.rulesets?.types && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">Todos los Rulesets</CardTitle>
                          <CardDescription>
                            Lista completa de rulesets (solo los custom firewall son utilizables)
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {testResults.data.rulesets.types.map((ruleset: any, index: number) => (
                              <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                                <span className="font-mono text-sm">{ruleset.name}</span>
                                <Badge variant={ruleset.phase === 'http_request_firewall_custom' ? 'default' : 'outline'}>
                                  {ruleset.phase}
                                </Badge>
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
    </div>
  );
}