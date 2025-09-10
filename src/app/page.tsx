'use client';

import { useState, useEffect } from 'react';
import { DomainTable } from '@/components/domain-table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Key } from 'lucide-react';
import Image from 'next/image';

export default function Home() {
  const [apiToken, setApiToken] = useState('');
  const [isTokenSet, setIsTokenSet] = useState(false);
  const [loadingToken, setLoadingToken] = useState(true);

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

  const handleTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (apiToken.trim()) {
      try {
        // Save token to .env
        await fetch('/api/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token: apiToken.trim() }),
        });
        setIsTokenSet(true);
      } catch (error) {
        console.error('Error saving token:', error);
      }
    }
  };

  const resetToken = () => {
    setApiToken('');
    setIsTokenSet(false);
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
        <div className="max-w-md mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Token API de Cloudflare
              </CardTitle>
              <CardDescription>
                Ingresa tu token API de Cloudflare para gestionar la configuración de proxy DNS
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleTokenSubmit} className="space-y-4">
                <Input
                  type="password"
                  placeholder="Ingresa tu token API de Cloudflare"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  required
                />
                <Button type="submit" className="w-full">
                  Conectar a Cloudflare
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <Image
              src="/logo-rollpix.png"
              alt="Rollpix"
              width={180}
              height={60}
              className="h-12 w-auto"
            />
            <Button onClick={resetToken} variant="outline" size="sm">
              Cambiar Token API
            </Button>
          </div>
          <DomainTable apiToken={apiToken} />
        </div>
      )}
    </div>
  );
}