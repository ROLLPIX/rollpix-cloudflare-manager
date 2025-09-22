/**
 * Secure file system operations
 * Implements path validation and prevents directory traversal attacks
 * Auto-fallback to memory cache in serverless environments
 */
import { promises as fs } from 'fs';
import { join, normalize, resolve } from 'path';
import { FileOperationSchema, validateApiRequest } from './validation';
import { UnifiedCache, isServerlessEnvironment } from './memoryCache';

// Define safe cache directory and allowed files
const SAFE_CACHE_DIR = resolve(process.cwd(), 'cache');
const ALLOWED_FILES = [
  'domains-cache.json',
  'security-rules-templates.json',
  'domain-rules-status.json',
  'user-preferences.json',
  'rule-id-mapping.json'
] as const;

type AllowedFileName = typeof ALLOWED_FILES[number];

/**
 * Returns default structure for cache files when they don't exist
 * @param fileName - Name of the cache file
 * @returns Default structure based on file type
 */
const getDefaultStructure = <T>(fileName: string): T => {
  switch (fileName) {
    case 'domains-cache.json':
      return {
        domains: [],
        lastUpdated: new Date().toISOString(),
        version: '1.0'
      } as T;

    case 'security-rules-templates.json':
      return {
        templates: [],
        lastUpdated: new Date().toISOString(),
        version: '1.0'
      } as T;

    case 'domain-rules-status.json':
      return {
        domains: {},
        lastUpdated: new Date().toISOString(),
        version: '1.0'
      } as T;

    case 'user-preferences.json':
      return {
        preferences: {},
        lastUpdated: new Date().toISOString(),
        version: '1.0'
      } as T;

    case 'rule-id-mapping.json':
      return {
        mapping: {},
        lastUpdated: new Date().toISOString(),
        version: '1.0'
      } as T;

    default:
      console.warn(`[FileSystem] No default structure defined for ${fileName}, returning empty object`);
      return {} as T;
  }
};

/**
 * Validates file name against whitelist and prevents path traversal
 * @param fileName - Name of the file to validate
 * @returns Safe file path
 * @throws Error if file name is not allowed or contains path traversal
 */
const validateAndGetSafePath = (fileName: string): string => {
  // Validate against schema
  try {
    validateApiRequest(FileOperationSchema, { fileName });
  } catch (error) {
    throw new Error(`Invalid file name: ${fileName}. Only specific cache files are allowed.`);
  }

  // Ensure it's in our allowed list
  if (!ALLOWED_FILES.includes(fileName as AllowedFileName)) {
    throw new Error(`File not in whitelist: ${fileName}`);
  }

  // Create safe path
  const safePath = join(SAFE_CACHE_DIR, fileName);
  const normalizedPath = normalize(safePath);

  // Prevent directory traversal
  if (!normalizedPath.startsWith(SAFE_CACHE_DIR)) {
    throw new Error(`Path traversal detected: ${fileName}`);
  }

  return normalizedPath;
};

/**
 * Ensures the cache directory exists
 */
const ensureCacheDirectory = async (): Promise<void> => {
  try {
    await fs.access(SAFE_CACHE_DIR);
  } catch (error) {
    // Directory doesn't exist, create it
    await fs.mkdir(SAFE_CACHE_DIR, { recursive: true });
  }
};

/**
 * Safely reads a file from the cache directory
 * @param fileName - Name of the file to read
 * @returns File content as string
 * @throws Error if file doesn't exist or can't be read
 */
export const safeReadFile = async (fileName: string): Promise<string> => {
  const safePath = validateAndGetSafePath(fileName);

  try {
    const content = await fs.readFile(safePath, 'utf-8');
    console.log(`[FileSystem] Successfully read file: ${fileName}`);
    return content;
  } catch (error) {
    console.error(`[FileSystem] Error reading file ${fileName} from cache/:`, error);

    // Fallback: try reading from root directory for backward compatibility
    try {
      const rootPath = resolve(process.cwd(), fileName);
      console.log(`[FileSystem] Attempting fallback read from root: ${fileName}`);
      const content = await fs.readFile(rootPath, 'utf-8');

      // Auto-migrate: copy file to cache directory
      await safeWriteFile(fileName, content);
      console.log(`[FileSystem] Auto-migrated ${fileName} from root to cache/`);

      return content;
    } catch (rootError) {
      console.error(`[FileSystem] Fallback read also failed for ${fileName}:`, rootError);
      throw new Error(`Failed to read file: ${fileName}`);
    }
  }
};

/**
 * Safely writes content to a file in the cache directory
 * @param fileName - Name of the file to write
 * @param content - Content to write
 * @throws Error if write operation fails
 */
export const safeWriteFile = async (fileName: string, content: string): Promise<void> => {
  const safePath = validateAndGetSafePath(fileName);
  
  try {
    // Ensure cache directory exists
    await ensureCacheDirectory();
    
    // Write file atomically (write to temp file first, then rename)
    const tempPath = `${safePath}.tmp`;
    await fs.writeFile(tempPath, content, 'utf-8');
    await fs.rename(tempPath, safePath);
    
    console.log(`[FileSystem] Successfully wrote file: ${fileName}`);
  } catch (error) {
    console.error(`[FileSystem] Error writing file ${fileName}:`, error);
    
    // Clean up temp file if it exists
    try {
      await fs.unlink(`${safePath}.tmp`);
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    
    throw new Error(`Failed to write file: ${fileName}`);
  }
};

/**
 * Safely checks if a file exists in the cache directory
 * Uses UnifiedCache to avoid circular dependencies
 * @param fileName - Name of the file to check
 * @returns True if file exists, false otherwise
 */
export const safeFileExists = async (fileName: string): Promise<boolean> => {
  // Use UnifiedCache directly to avoid circular dependencies
  return await UnifiedCache.exists(fileName);
};

/**
 * Safely deletes a file from the cache directory
 * @param fileName - Name of the file to delete
 * @throws Error if delete operation fails
 */
export const safeDeleteFile = async (fileName: string): Promise<void> => {
  const safePath = validateAndGetSafePath(fileName);
  
  try {
    await fs.unlink(safePath);
    console.log(`[FileSystem] Successfully deleted file: ${fileName}`);
  } catch (error) {
    console.error(`[FileSystem] Error deleting file ${fileName}:`, error);
    throw new Error(`Failed to delete file: ${fileName}`);
  }
};

/**
 * Gets file stats safely
 * @param fileName - Name of the file
 * @returns File stats or null if file doesn't exist
 */
export const safeGetFileStats = async (fileName: string): Promise<{ size: number; mtime: Date } | null> => {
  const safePath = validateAndGetSafePath(fileName);
  
  try {
    const stats = await fs.stat(safePath);
    return {
      size: stats.size,
      mtime: stats.mtime
    };
  } catch (error) {
    return null;
  }
};

/**
 * Lists all allowed files that exist in the cache directory
 * @returns Array of existing file names
 */
export const listCacheFiles = async (): Promise<string[]> => {
  const existingFiles: string[] = [];
  
  for (const fileName of ALLOWED_FILES) {
    if (await safeFileExists(fileName)) {
      existingFiles.push(fileName);
    }
  }
  
  return existingFiles;
};

/**
 * Safely reads and parses JSON file
 * Uses UnifiedCache to avoid circular dependencies
 * @param fileName - Name of the JSON file
 * @returns Parsed JSON object
 * @throws Error if file doesn't exist, can't be read, or contains invalid JSON
 */
export const safeReadJsonFile = async <T = any>(fileName: string): Promise<T> => {
  console.log(`[FileSystem] Reading ${fileName} using UnifiedCache (no circular deps)`);

  try {
    // Use UnifiedCache directly to avoid circular dependencies
    const data = await UnifiedCache.read<T>(fileName);

    if (data !== null) {
      return data;
    }

    // If no data found, return default structure
    console.log(`[FileSystem] No data found for ${fileName}, returning default structure`);
    return getDefaultStructure<T>(fileName);

  } catch (error) {
    console.error(`[FileSystem] Error reading ${fileName}:`, error);

    // Return default structure if all else fails
    console.log(`[FileSystem] Returning default structure for ${fileName} due to error`);
    return getDefaultStructure<T>(fileName);
  }
};

/**
 * Safely writes object as JSON file
 * Uses UnifiedCache to avoid circular dependencies
 * @param fileName - Name of the JSON file
 * @param data - Object to serialize as JSON
 * @throws Error if serialization or write operation fails
 */
export const safeWriteJsonFile = async (fileName: string, data: any): Promise<void> => {
  try {
    console.log(`[FileSystem] Writing ${fileName} using UnifiedCache (no circular deps)`);

    // Use UnifiedCache directly to avoid circular dependencies
    await UnifiedCache.write(fileName, data);

    console.log(`[FileSystem] Successfully wrote ${fileName} using UnifiedCache`);
  } catch (error) {
    console.error(`[FileSystem] Error writing JSON to ${fileName}:`, error);
    throw new Error(`Failed to write JSON file: ${fileName}`);
  }
};

/**
 * Invalidates cache for a specific file (compatible with serverless)
 * @param fileName - Name of the file to invalidate
 */
export const invalidateCache = async (fileName: string): Promise<void> => {
  await UnifiedCache.delete(fileName);
};

/**
 * Gets cache information and statistics
 * @returns Cache information including environment and stats
 */
export const getCacheInfo = () => {
  return UnifiedCache.getInfo();
};

// Export allowed file names for type safety
export { ALLOWED_FILES };
export type { AllowedFileName };
