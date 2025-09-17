/**
 * Secure file system operations
 * Implements path validation and prevents directory traversal attacks
 */
import { promises as fs } from 'fs';
import { join, normalize, resolve } from 'path';
import { FileOperationSchema, validateApiRequest } from './validation';

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
 * @param fileName - Name of the file to check
 * @returns True if file exists, false otherwise
 */
export const safeFileExists = async (fileName: string): Promise<boolean> => {
  const safePath = validateAndGetSafePath(fileName);
  
  try {
    await fs.access(safePath);
    return true;
  } catch (error) {
    return false;
  }
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
 * @param fileName - Name of the JSON file
 * @returns Parsed JSON object
 * @throws Error if file doesn't exist, can't be read, or contains invalid JSON
 */
export const safeReadJsonFile = async <T = any>(fileName: string): Promise<T> => {
  const content = await safeReadFile(fileName);
  
  try {
    return JSON.parse(content) as T;
  } catch (error) {
    console.error(`[FileSystem] Error parsing JSON from ${fileName}:`, error);
    throw new Error(`Invalid JSON in file: ${fileName}`);
  }
};

/**
 * Safely writes object as JSON file
 * @param fileName - Name of the JSON file
 * @param data - Object to serialize as JSON
 * @throws Error if serialization or write operation fails
 */
export const safeWriteJsonFile = async (fileName: string, data: any): Promise<void> => {
  try {
    const content = JSON.stringify(data, null, 2);
    await safeWriteFile(fileName, content);
  } catch (error) {
    console.error(`[FileSystem] Error writing JSON to ${fileName}:`, error);
    throw new Error(`Failed to write JSON file: ${fileName}`);
  }
};

// Export allowed file names for type safety
export { ALLOWED_FILES };
export type { AllowedFileName };
