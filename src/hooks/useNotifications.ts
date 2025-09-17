'use client';

import { toast } from 'sonner';

export interface NotificationOptions {
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const useNotifications = () => {
  const success = (message: string, options?: NotificationOptions) => {
    return toast.success(message, {
      duration: options?.duration ?? 4000,
      action: options?.action,
    });
  };

  const error = (message: string, options?: NotificationOptions) => {
    return toast.error(message, {
      duration: options?.duration ?? 5000,
      action: options?.action,
    });
  };

  const info = (message: string, options?: NotificationOptions) => {
    return toast.info(message, {
      duration: options?.duration ?? 4000,
      action: options?.action,
    });
  };

  const warning = (message: string, options?: NotificationOptions) => {
    return toast.warning(message, {
      duration: options?.duration ?? 4000,
      action: options?.action,
    });
  };

  // Specialized notifications for common operations
  const domainOperation = {
    success: (operation: string, count: number) => {
      success(`${operation} completado en ${count} dominio${count !== 1 ? 's' : ''}`);
    },
    error: (operation: string, errorMessage?: string) => {
      error(`Error en ${operation}: ${errorMessage || 'Operación fallida'}`);
    },
    partial: (operation: string, successCount: number, totalCount: number) => {
      warning(`${operation}: ${successCount}/${totalCount} dominios completados`);
    },
  };

  const ruleOperation = {
    success: (operation: string, ruleName: string) => {
      success(`Regla "${ruleName}" ${operation} exitosamente`);
    },
    error: (operation: string, ruleName: string, errorMessage?: string) => {
      error(`Error al ${operation} regla "${ruleName}": ${errorMessage || 'Operación fallida'}`);
    },
  };

  const apiOperation = {
    success: (message: string) => {
      success(message);
    },
    error: (message: string, details?: string) => {
      error(`${message}${details ? `: ${details}` : ''}`);
    },
    rateLimit: () => {
      warning('Límite de API alcanzado. Espera unos minutos antes de continuar.');
    },
    networkError: () => {
      error('Error de conexión. Verifica tu conexión a internet.');
    },
  };

  return {
    success,
    error,
    info,
    warning,
    domainOperation,
    ruleOperation,
    apiOperation,
  };
};