/**
 * Memory-based cache system for production environments
 * Fallback to file system for local development
 */

type CacheEntry<T> = {
  data: T;
  timestamp: number;
  ttl?: number; // Time to live in milliseconds
};

// Global memory cache - survives between requests in serverless
const memoryCache = new Map<string, CacheEntry<any>>();

// Default TTL: 5 minutes for most cache entries
const DEFAULT_TTL = 5 * 60 * 1000;

// Cache TTL configuration per file type
const CACHE_TTL_CONFIG: Record<string, number> = {
  'domains-cache.json': 2 * 60 * 1000,           // 2 minutes - can be regenerated
  'security-rules-templates.json': 60 * 60 * 1000, // 1 hour - needs persistence
  'domain-rules-status.json': 2 * 60 * 1000,     // 2 minutes - can be regenerated
  'user-preferences.json': 24 * 60 * 60 * 1000,  // 24 hours - needs persistence
  'rule-id-mapping.json': 30 * 60 * 1000,        // 30 minutes - can be regenerated
};

// Data types that need persistent storage in serverless environments
const NEEDS_PERSISTENCE: Record<string, boolean> = {
  'domains-cache.json': false,           // Can be regenerated from Cloudflare
  'security-rules-templates.json': true, // User-created templates must persist
  'domain-rules-status.json': false,     // Can be regenerated
  'user-preferences.json': true,         // User preferences must persist
  'rule-id-mapping.json': false,         // Can be regenerated
};

/**
 * Detects if we're running in a production environment
 */
const isServerlessEnvironment = (): boolean => {
  return (
    !!process.env.LAMBDA_TASK_ROOT ||
    !!process.env.AWS_LAMBDA_FUNCTION_NAME ||
    !process.env.NODE_ENV ||
    process.env.NODE_ENV === 'production'
  );
};

/**
 * Checks if a cache entry is expired
 */
const isExpired = (entry: CacheEntry<any>): boolean => {
  if (!entry.ttl) return false;
  return Date.now() - entry.timestamp > entry.ttl;
};

/**
 * Gets TTL for a specific file
 */
const getTTLForFile = (fileName: string): number => {
  return CACHE_TTL_CONFIG[fileName] || DEFAULT_TTL;
};

/**
 * Memory cache operations
 */
export class MemoryCache {
  /**
   * Sets a value in memory cache
   */
  static set<T>(key: string, data: T, customTTL?: number): void {
    const ttl = customTTL || getTTLForFile(key);
    memoryCache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
    console.log(`[MemoryCache] Set key: ${key} (TTL: ${ttl}ms)`);
  }

  /**
   * Gets a value from memory cache
   */
  static get<T>(key: string): T | null {
    const entry = memoryCache.get(key);

    if (!entry) {
      console.log(`[MemoryCache] Cache miss: ${key}`);
      return null;
    }

    if (isExpired(entry)) {
      console.log(`[MemoryCache] Cache expired: ${key}`);
      memoryCache.delete(key);
      return null;
    }

    console.log(`[MemoryCache] Cache hit: ${key}`);
    return entry.data as T;
  }

  /**
   * Checks if a key exists and is not expired
   */
  static has(key: string): boolean {
    const entry = memoryCache.get(key);
    if (!entry) return false;

    if (isExpired(entry)) {
      memoryCache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Deletes a key from memory cache
   */
  static delete(key: string): boolean {
    const result = memoryCache.delete(key);
    if (result) {
      console.log(`[MemoryCache] Deleted key: ${key}`);
    }
    return result;
  }

  /**
   * Clears all cache entries
   */
  static clear(): void {
    memoryCache.clear();
    console.log(`[MemoryCache] Cleared all cache entries`);
  }

  /**
   * Gets cache statistics
   */
  static getStats(): {
    totalEntries: number;
    expiredEntries: number;
    validEntries: number;
    keys: string[];
  } {
    const keys = Array.from(memoryCache.keys());
    let expiredEntries = 0;
    let validEntries = 0;

    keys.forEach(key => {
      const entry = memoryCache.get(key);
      if (entry && isExpired(entry)) {
        expiredEntries++;
      } else if (entry) {
        validEntries++;
      }
    });

    return {
      totalEntries: memoryCache.size,
      expiredEntries,
      validEntries,
      keys
    };
  }

  /**
   * Cleanup expired entries
   */
  static cleanup(): number {
    const keys = Array.from(memoryCache.keys());
    let cleanedCount = 0;

    keys.forEach(key => {
      const entry = memoryCache.get(key);
      if (entry && isExpired(entry)) {
        memoryCache.delete(key);
        cleanedCount++;
      }
    });

    if (cleanedCount > 0) {
      console.log(`[MemoryCache] Cleaned up ${cleanedCount} expired entries`);
    }

    return cleanedCount;
  }
}

/**
 * Unified cache interface that automatically chooses between memory and file system
 * IMPORTANT: Uses direct file system operations to avoid circular dependencies
 */
export class UnifiedCache {
  /**
   * Reads data from cache (memory or file system)
   */
  static async read<T>(fileName: string): Promise<T | null> {
    const isServerless = isServerlessEnvironment();

    console.log(`[UnifiedCache] Reading ${fileName} (serverless: ${isServerless})`);

    if (isServerless) {
      // Use memory cache in serverless environment
      return MemoryCache.get<T>(fileName);
    } else {
      // Use file system in local development - DIRECT operations to avoid loops
      try {
        const data = await this.readFromFileSystemDirect<T>(fileName);

        // Also cache in memory for performance
        if (data !== null) {
          MemoryCache.set(fileName, data);
        }

        return data;
      } catch (error) {
        console.log(`[UnifiedCache] File system read failed for ${fileName}, checking memory cache`);
        return MemoryCache.get<T>(fileName);
      }
    }
  }

  /**
   * Direct file system read without going through other cache layers
   */
  private static async readFromFileSystemDirect<T>(fileName: string): Promise<T | null> {
    try {
      const { promises: fs } = await import('fs');
      const { resolve } = await import('path');

      const filePath = resolve(process.cwd(), 'cache', fileName);
      const content = await fs.readFile(filePath, 'utf-8');

      console.log(`[UnifiedCache] Direct file read successful: ${fileName}`);
      return JSON.parse(content) as T;

    } catch (error) {
      // Try reading from root directory as fallback
      try {
        const { promises: fs } = await import('fs');
        const { resolve } = await import('path');

        const rootPath = resolve(process.cwd(), fileName);
        const content = await fs.readFile(rootPath, 'utf-8');

        console.log(`[UnifiedCache] Fallback root read successful: ${fileName}`);
        return JSON.parse(content) as T;

      } catch (rootError) {
        console.log(`[UnifiedCache] Both cache and root read failed for ${fileName}`);
        return null;
      }
    }
  }

  /**
   * Writes data to cache (memory or file system)
   * IMPORTANT: Uses direct file system operations to avoid circular dependencies
   */
  static async write<T>(fileName: string, data: T): Promise<void> {
    const isServerless = isServerlessEnvironment();

    console.log(`[UnifiedCache] Writing ${fileName} (serverless: ${isServerless})`);

    // Always cache in memory for performance
    MemoryCache.set(fileName, data);

    if (!isServerless) {
      // Also write to file system in local development - DIRECT operations to avoid loops
      try {
        await this.writeToFileSystemDirect(fileName, data);
      } catch (error) {
        console.warn(`[UnifiedCache] File system write failed for ${fileName}:`, error);
        // Continue with memory-only cache
      }
    }
  }

  /**
   * Direct file system write without going through other cache layers
   */
  private static async writeToFileSystemDirect<T>(fileName: string, data: T): Promise<void> {
    try {
      const { promises: fs } = await import('fs');
      const { resolve, dirname } = await import('path');

      const filePath = resolve(process.cwd(), 'cache', fileName);
      const dirPath = dirname(filePath);

      // Ensure cache directory exists
      try {
        await fs.access(dirPath);
      } catch {
        await fs.mkdir(dirPath, { recursive: true });
      }

      // Write file atomically
      const content = JSON.stringify(data, null, 2);
      const tempPath = `${filePath}.tmp`;

      await fs.writeFile(tempPath, content, 'utf-8');
      await fs.rename(tempPath, filePath);

      console.log(`[UnifiedCache] Direct file write successful: ${fileName}`);

    } catch (error) {
      console.error(`[UnifiedCache] Direct file write failed for ${fileName}:`, error);
      throw error;
    }
  }

  /**
   * Checks if data exists in cache
   * IMPORTANT: Uses direct file system operations to avoid circular dependencies
   */
  static async exists(fileName: string): Promise<boolean> {
    const isServerless = isServerlessEnvironment();

    if (isServerless) {
      return MemoryCache.has(fileName);
    } else {
      // Check memory first for performance
      if (MemoryCache.has(fileName)) {
        return true;
      }

      // Check file system directly
      try {
        const { promises: fs } = await import('fs');
        const { resolve } = await import('path');

        const filePath = resolve(process.cwd(), 'cache', fileName);
        await fs.access(filePath);
        return true;
      } catch {
        // Try root directory as fallback
        try {
          const { promises: fs } = await import('fs');
          const { resolve } = await import('path');

          const rootPath = resolve(process.cwd(), fileName);
          await fs.access(rootPath);
          return true;
        } catch {
          return false;
        }
      }
    }
  }

  /**
   * Deletes data from cache
   */
  static async delete(fileName: string): Promise<void> {
    const isServerless = isServerlessEnvironment();

    console.log(`[UnifiedCache] Deleting ${fileName} (serverless: ${isServerless})`);

    // Always delete from memory
    MemoryCache.delete(fileName);

    if (!isServerless) {
      // Also delete from file system in local development
      try {
        const { safeDeleteFile } = await import('./fileSystem');
        await safeDeleteFile(fileName);
      } catch (error) {
        console.warn(`[UnifiedCache] File system delete failed for ${fileName}:`, error);
        // Continue with memory-only operation
      }
    }
  }

  /**
   * Invalidates cache entry (forces reload on next access)
   */
  static async invalidate(fileName: string): Promise<void> {
    console.log(`[UnifiedCache] Invalidating cache for ${fileName}`);
    await this.delete(fileName);
  }

  /**
   * Gets cache information
   */
  static getInfo(): {
    environment: 'serverless' | 'local';
    memoryStats: ReturnType<typeof MemoryCache.getStats>;
  } {
    return {
      environment: isServerlessEnvironment() ? 'serverless' : 'local',
      memoryStats: MemoryCache.getStats()
    };
  }
}

/**
 * Cleanup function to run periodically
 */
export const runCacheCleanup = (): void => {
  console.log('[Cache] Running periodic cleanup...');
  MemoryCache.cleanup();
};

/**
 * Initialize periodic cache cleanup (should only be called at runtime)
 */
let cleanupInterval: NodeJS.Timeout | null = null;
export const initCacheCleanup = (): void => {
  // Only initialize once
  if (cleanupInterval) return;

  // Only run in environments with setInterval
  if (typeof setInterval !== 'undefined') {
    cleanupInterval = setInterval(runCacheCleanup, 10 * 60 * 1000);
    console.log('[Cache] Periodic cleanup initialized');
  }
};

export { isServerlessEnvironment };