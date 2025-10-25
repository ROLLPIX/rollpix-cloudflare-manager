/**
 * Persistent storage system for serverless environments
 * Uses different strategies based on data type and environment
 */

import { UnifiedCache, MemoryCache, isServerlessEnvironment } from './memoryCache';

// Storage strategies for different data types
enum StorageStrategy {
  CLIENT_STORAGE = 'client',     // localStorage on client side
  API_ENDPOINT = 'api',          // Custom API endpoint with external storage
  MEMORY_ONLY = 'memory',        // Memory cache only (regenerable data)
  FILE_SYSTEM = 'filesystem'     // File system (local development only)
}

// Configuration for each data type
const STORAGE_CONFIG: Record<string, {
  strategy: StorageStrategy;
  critical: boolean;
  regenerable: boolean;
}> = {
  'domains-cache.json': {
    strategy: StorageStrategy.FILE_SYSTEM,  // Changed to FILE_SYSTEM for volume persistence
    critical: false,
    regenerable: true
  },
  'security-rules-templates.json': {
    strategy: StorageStrategy.FILE_SYSTEM,  // Changed from CLIENT_STORAGE to FILE_SYSTEM for Dokploy
    critical: true,
    regenerable: false
  },
  'domain-rules-status.json': {
    strategy: StorageStrategy.FILE_SYSTEM,  // Changed from MEMORY_ONLY to persist in production
    critical: true,  // Changed to true - this IS critical for domain-rules relationship
    regenerable: true
  },
  'user-preferences.json': {
    strategy: StorageStrategy.FILE_SYSTEM,  // Changed from CLIENT_STORAGE to FILE_SYSTEM for Dokploy
    critical: true,
    regenerable: false
  },
  'rule-id-mapping.json': {
    strategy: StorageStrategy.FILE_SYSTEM,  // Changed to FILE_SYSTEM for volume persistence
    critical: false,
    regenerable: true
  }
};

/**
 * Client-side storage manager (browser localStorage)
 */
export class ClientStorage {
  private static isClient(): boolean {
    return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
  }

  private static getKey(fileName: string): string {
    return `rollpix_cache_${fileName}`;
  }

  static async read<T>(fileName: string): Promise<T | null> {
    if (!this.isClient()) {
      console.log(`[ClientStorage] Not in client environment, cannot read ${fileName}`);
      return null;
    }

    try {
      const key = this.getKey(fileName);
      const stored = localStorage.getItem(key);

      if (!stored) {
        console.log(`[ClientStorage] No data found for ${fileName}`);
        return null;
      }

      const parsed = JSON.parse(stored);

      // Check if data has expiration
      if (parsed.expiry && Date.now() > parsed.expiry) {
        console.log(`[ClientStorage] Data expired for ${fileName}, removing`);
        localStorage.removeItem(key);
        return null;
      }

      console.log(`[ClientStorage] Successfully read ${fileName}`);
      return parsed.data as T;

    } catch (error) {
      console.error(`[ClientStorage] Error reading ${fileName}:`, error);
      return null;
    }
  }

  static async write<T>(fileName: string, data: T, ttlMs?: number): Promise<void> {
    if (!this.isClient()) {
      console.log(`[ClientStorage] Not in client environment, cannot write ${fileName}`);
      return;
    }

    try {
      const key = this.getKey(fileName);
      const expiry = ttlMs ? Date.now() + ttlMs : null;

      const toStore = {
        data,
        timestamp: Date.now(),
        expiry
      };

      localStorage.setItem(key, JSON.stringify(toStore));
      console.log(`[ClientStorage] Successfully wrote ${fileName}${expiry ? ` (expires in ${ttlMs}ms)` : ''}`);

    } catch (error) {
      console.error(`[ClientStorage] Error writing ${fileName}:`, error);

      // Handle quota exceeded
      if (error instanceof DOMException && error.code === 22) {
        console.warn(`[ClientStorage] Storage quota exceeded, clearing old cache...`);
        this.cleanup();

        // Try again after cleanup
        try {
          const key = this.getKey(fileName);
          const expiry = ttlMs ? Date.now() + ttlMs : null;

          const toStore = {
            data,
            timestamp: Date.now(),
            expiry
          };

          localStorage.setItem(key, JSON.stringify(toStore));
          console.log(`[ClientStorage] Successfully wrote ${fileName} after cleanup`);
        } catch (retryError) {
          console.error(`[ClientStorage] Failed to write ${fileName} even after cleanup:`, retryError);
        }
      }
    }
  }

  static async exists(fileName: string): Promise<boolean> {
    if (!this.isClient()) return false;

    try {
      const key = this.getKey(fileName);
      const stored = localStorage.getItem(key);

      if (!stored) return false;

      const parsed = JSON.parse(stored);

      // Check expiration
      if (parsed.expiry && Date.now() > parsed.expiry) {
        localStorage.removeItem(key);
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  static async delete(fileName: string): Promise<void> {
    if (!this.isClient()) return;

    try {
      const key = this.getKey(fileName);
      localStorage.removeItem(key);
      console.log(`[ClientStorage] Deleted ${fileName}`);
    } catch (error) {
      console.error(`[ClientStorage] Error deleting ${fileName}:`, error);
    }
  }

  /**
   * Cleanup expired entries and manage storage quota
   */
  static cleanup(): void {
    if (!this.isClient()) return;

    try {
      const keys = Object.keys(localStorage);
      const rollpixKeys = keys.filter(key => key.startsWith('rollpix_cache_'));

      let deletedCount = 0;

      rollpixKeys.forEach(key => {
        try {
          const stored = localStorage.getItem(key);
          if (stored) {
            const parsed = JSON.parse(stored);

            // Delete expired entries
            if (parsed.expiry && Date.now() > parsed.expiry) {
              localStorage.removeItem(key);
              deletedCount++;
            }
          }
        } catch (error) {
          // If we can't parse it, it's probably corrupted - delete it
          localStorage.removeItem(key);
          deletedCount++;
        }
      });

      console.log(`[ClientStorage] Cleanup completed, deleted ${deletedCount} entries`);

    } catch (error) {
      console.error('[ClientStorage] Error during cleanup:', error);
    }
  }

  /**
   * Get storage usage statistics
   */
  static getStats(): {
    totalKeys: number;
    rollpixKeys: number;
    estimatedSize: number;
  } {
    if (!this.isClient()) {
      return { totalKeys: 0, rollpixKeys: 0, estimatedSize: 0 };
    }

    const keys = Object.keys(localStorage);
    const rollpixKeys = keys.filter(key => key.startsWith('rollpix_cache_'));

    let estimatedSize = 0;
    rollpixKeys.forEach(key => {
      const value = localStorage.getItem(key);
      if (value) {
        estimatedSize += key.length + value.length;
      }
    });

    return {
      totalKeys: keys.length,
      rollpixKeys: rollpixKeys.length,
      estimatedSize
    };
  }
}

/**
 * Enhanced persistent storage that combines multiple strategies
 */
export class PersistentStorage {
  /**
   * Read data using the appropriate strategy for the data type
   */
  static async read<T>(fileName: string): Promise<T | null> {
    const config = STORAGE_CONFIG[fileName];

    if (!config) {
      console.warn(`[PersistentStorage] No config found for ${fileName}, using UnifiedCache`);
      return await UnifiedCache.read<T>(fileName);
    }

    const isServerless = isServerlessEnvironment();

    switch (config.strategy) {
      case StorageStrategy.CLIENT_STORAGE:
        if (isServerless) {
          // In serverless, try client storage first, then memory cache directly
          const clientData = await ClientStorage.read<T>(fileName);
          if (clientData !== null) {
            // Also cache in memory for performance (no circular calls)
            MemoryCache.set(fileName, clientData);
            return clientData;
          }

          // Fallback to memory cache directly (no circular calls)
          return MemoryCache.get<T>(fileName);
        } else {
          // In local development, use unified cache (direct file system access)
          return await UnifiedCache.read<T>(fileName);
        }

      case StorageStrategy.MEMORY_ONLY:
        // Use UnifiedCache which handles file system directly in local dev
        return await UnifiedCache.read<T>(fileName);

      case StorageStrategy.FILE_SYSTEM:
        if (isServerless) {
          console.warn(`[PersistentStorage] File system strategy not available in serverless for ${fileName}`);
          return null;
        }
        // Use UnifiedCache which handles file system directly
        return await UnifiedCache.read<T>(fileName);

      default:
        // Use UnifiedCache which handles file system directly
        return await UnifiedCache.read<T>(fileName);
    }
  }

  /**
   * Write data using the appropriate strategy for the data type
   */
  static async write<T>(fileName: string, data: T): Promise<void> {
    const config = STORAGE_CONFIG[fileName];

    if (!config) {
      console.warn(`[PersistentStorage] No config found for ${fileName}, using UnifiedCache`);
      await UnifiedCache.write(fileName, data);
      return;
    }

    const isServerless = isServerlessEnvironment();

    switch (config.strategy) {
      case StorageStrategy.CLIENT_STORAGE:
        if (isServerless) {
          // In serverless, write to both client storage and memory cache directly
          await Promise.all([
            ClientStorage.write(fileName, data, 24 * 60 * 60 * 1000), // 24 hours in client
            Promise.resolve(MemoryCache.set(fileName, data)) // Direct memory cache for current request
          ]);
        } else {
          // In local development, use unified cache (direct file system)
          await UnifiedCache.write(fileName, data);
        }
        break;

      case StorageStrategy.MEMORY_ONLY:
        // Use UnifiedCache which handles file system directly in local dev
        await UnifiedCache.write(fileName, data);
        break;

      case StorageStrategy.FILE_SYSTEM:
        if (isServerless) {
          console.warn(`[PersistentStorage] File system strategy not available in serverless for ${fileName}, using memory`);
          MemoryCache.set(fileName, data); // Direct memory only
        } else {
          // Use UnifiedCache which handles file system directly
          await UnifiedCache.write(fileName, data);
        }
        break;

      default:
        // Use UnifiedCache which handles file system directly
        await UnifiedCache.write(fileName, data);
        break;
    }
  }

  /**
   * Check if data exists using the appropriate strategy
   */
  static async exists(fileName: string): Promise<boolean> {
    const config = STORAGE_CONFIG[fileName];

    if (!config) {
      return await UnifiedCache.exists(fileName);
    }

    const isServerless = isServerlessEnvironment();

    switch (config.strategy) {
      case StorageStrategy.CLIENT_STORAGE:
        if (isServerless) {
          // Check both client storage and memory cache directly
          const clientExists = await ClientStorage.exists(fileName);
          const memoryExists = MemoryCache.has(fileName);
          return clientExists || memoryExists;
        } else {
          // Use UnifiedCache which handles file system directly
          return await UnifiedCache.exists(fileName);
        }

      default:
        // Use UnifiedCache which handles file system directly
        return await UnifiedCache.exists(fileName);
    }
  }

  /**
   * Delete data using the appropriate strategy
   */
  static async delete(fileName: string): Promise<void> {
    const config = STORAGE_CONFIG[fileName];

    if (!config) {
      await UnifiedCache.delete(fileName);
      return;
    }

    const isServerless = isServerlessEnvironment();

    switch (config.strategy) {
      case StorageStrategy.CLIENT_STORAGE:
        if (isServerless) {
          // Delete from both client storage and memory cache directly
          await Promise.all([
            ClientStorage.delete(fileName),
            Promise.resolve(MemoryCache.delete(fileName))
          ]);
        } else {
          // Use UnifiedCache which handles file system directly
          await UnifiedCache.delete(fileName);
        }
        break;

      default:
        // Use UnifiedCache which handles file system directly
        await UnifiedCache.delete(fileName);
        break;
    }
  }

  /**
   * Get information about storage usage and strategies
   */
  static getInfo(): {
    environment: 'serverless' | 'local';
    strategies: Record<string, { strategy: string; critical: boolean; regenerable: boolean }>;
    clientStorageStats?: ReturnType<typeof ClientStorage.getStats>;
    memoryStats: any;
  } {
    const isServerless = isServerlessEnvironment();

    const info: any = {
      environment: isServerless ? 'serverless' : 'local',
      strategies: STORAGE_CONFIG,
      memoryStats: UnifiedCache.getInfo()
    };

    if (isServerless && typeof window !== 'undefined') {
      info.clientStorageStats = ClientStorage.getStats();
    }

    return info;
  }

  /**
   * Perform maintenance tasks (cleanup, etc.)
   */
  static async maintenance(): Promise<void> {
    console.log('[PersistentStorage] Running maintenance...');

    // Cleanup client storage if available
    if (typeof window !== 'undefined') {
      ClientStorage.cleanup();
    }

    // Could add more maintenance tasks here
    console.log('[PersistentStorage] Maintenance completed');
  }

  /**
   * Clear ALL cache files
   * Use this when changing API tokens to ensure no stale data from previous account
   */
  static async clearAll(): Promise<void> {
    console.log('[PersistentStorage] Clearing ALL cache files...');

    const filesToClear = Object.keys(STORAGE_CONFIG);

    for (const fileName of filesToClear) {
      try {
        await this.delete(fileName);
        console.log(`[PersistentStorage] Cleared ${fileName}`);
      } catch (error) {
        console.warn(`[PersistentStorage] Failed to clear ${fileName}:`, error);
      }
    }

    console.log('[PersistentStorage] All cache files cleared successfully');
  }
}

// Auto-cleanup every 30 minutes if in client environment
if (typeof window !== 'undefined' && typeof setInterval !== 'undefined') {
  setInterval(() => {
    ClientStorage.cleanup();
  }, 30 * 60 * 1000);
}

export { StorageStrategy, STORAGE_CONFIG };