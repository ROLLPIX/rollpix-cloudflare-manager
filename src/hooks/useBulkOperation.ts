'use client';

import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';

interface BulkOperationDomain {
  zoneId: string;
  domainName: string;
  status?: 'pending' | 'processing' | 'success' | 'error';
  message?: string;
  error?: string;
}

interface BulkOperationProgress {
  type: 'progress' | 'domain_complete' | 'complete' | 'error';
  progress: number;
  currentDomain?: string;
  completedDomains?: number;
  totalDomains?: number;
  domain?: {
    zoneId: string;
    domainName: string;
    success: boolean;
    message: string;
    error?: string;
  };
  summary?: {
    total: number;
    successful: number;
    failed: number;
  };
  error?: string;
}

interface UseBulkOperationOptions {
  endpoint: string;
  apiToken: string;
  onComplete?: (summary: { total: number; successful: number; failed: number }) => void;
  onError?: (error: string) => void;
}

export function useBulkOperation({
  endpoint,
  apiToken,
  onComplete,
  onError
}: UseBulkOperationOptions) {
  const [domains, setDomains] = useState<BulkOperationDomain[]>([]);
  const [progress, setProgress] = useState(0);
  const [isStarted, setIsStarted] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [summary, setSummary] = useState<{ total: number; successful: number; failed: number } | undefined>();
  const abortControllerRef = useRef<AbortController | null>(null);

  const initializeDomains = useCallback((initialDomains: Array<{ zoneId: string; domainName: string }>) => {
    setDomains(initialDomains.map(domain => ({
      ...domain,
      status: 'pending'
    })));
    setProgress(0);
    setIsStarted(false);
    setIsCompleted(false);
    setSummary(undefined);
  }, []);

  const startCustomOperation = useCallback(async (customEndpoint: string, payload: any) => {
    try {
      setIsStarted(true);
      setProgress(0);
      setIsCompleted(false);

      // Create abort controller for cancellation
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const response = await fetch(customEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-token': apiToken
        },
        body: JSON.stringify({
          ...payload,
          signal: abortController.signal
        }),
        signal: abortController.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No response body for streaming');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.trim().startsWith('data: ')) {
              try {
                const data: BulkOperationProgress = JSON.parse(line.slice(6));

                // Update progress
                setProgress(data.progress);

                if (data.type === 'domain_complete' && data.domain) {
                  // Update specific domain status
                  setDomains(prev => prev.map(domain =>
                    domain.zoneId === data.domain!.zoneId
                      ? {
                          ...domain,
                          status: data.domain!.success ? 'success' : 'error',
                          message: data.domain!.message,
                          error: data.domain!.error
                        }
                      : domain
                  ));
                } else if (data.type === 'complete' && data.summary) {
                  // Operation completed
                  setIsCompleted(true);
                  setSummary(data.summary);
                  onComplete?.(data.summary);

                  toast.success(`Operación completada: ${data.summary.successful} éxitos, ${data.summary.failed} errores`);
                } else if (data.type === 'error') {
                  // Operation failed
                  setIsCompleted(true);
                  onError?.(data.error || 'Error desconocido');
                  toast.error(`Error en la operación: ${data.error}`);
                }

              } catch (parseError) {
                console.warn('Failed to parse SSE data:', parseError);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        toast.info('Operación cancelada');
      } else {
        console.error('Bulk operation error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        onError?.(errorMessage);
        toast.error(`Error en la operación: ${errorMessage}`);
      }
      setIsCompleted(true);
    } finally {
      abortControllerRef.current = null;
    }
  }, [apiToken, onComplete, onError]);

  const startOperation = useCallback(async (operationData: {
    action: string;
    selectedRules?: string[];
    targetZoneIds: string[];
  }) => {
    return await startCustomOperation(endpoint, operationData);
  }, [endpoint, startCustomOperation]);

  const cancelOperation = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      toast.info('Cancelando operación...');
    }
  }, []);

  const resetOperation = useCallback(() => {
    setDomains([]);
    setProgress(0);
    setIsStarted(false);
    setIsCompleted(false);
    setSummary(undefined);
    abortControllerRef.current = null;
  }, []);

  return {
    domains,
    progress,
    isStarted,
    isCompleted,
    summary,
    initializeDomains,
    startOperation,
    startCustomOperation,
    cancelOperation,
    resetOperation,
    canCancel: !!abortControllerRef.current
  };
}