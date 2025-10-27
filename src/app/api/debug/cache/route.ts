import { NextResponse } from 'next/server';
import { readdir, stat, readFile } from 'fs/promises';
import path from 'path';

/**
 * Debug endpoint to check cache directory status in production
 * GET /api/debug/cache
 */
export async function GET() {
  try {
    const cacheDir = path.join(process.cwd(), 'cache');

    console.log('[Debug] Cache directory path:', cacheDir);
    console.log('[Debug] Current working directory:', process.cwd());

    const debug: any = {
      cwd: process.cwd(),
      cacheDir,
      exists: false,
      files: [],
      error: null
    };

    try {
      // Check if cache directory exists
      const cacheStat = await stat(cacheDir);
      debug.exists = cacheStat.isDirectory();
      debug.permissions = cacheStat.mode.toString(8);

      if (debug.exists) {
        // List files in cache directory
        const files = await readdir(cacheDir);
        debug.fileCount = files.length;

        for (const file of files) {
          const filePath = path.join(cacheDir, file);
          try {
            const fileStat = await stat(filePath);
            const fileInfo: any = {
              name: file,
              size: fileStat.size,
              permissions: fileStat.mode.toString(8),
              modified: fileStat.mtime
            };

            // If it's security-rules-templates.json, read its content
            if (file === 'security-rules-templates.json') {
              try {
                const content = await readFile(filePath, 'utf-8');
                const parsed = JSON.parse(content);
                fileInfo.templatesCount = parsed.templates?.length || 0;
                fileInfo.lastUpdated = parsed.lastUpdated;
              } catch (readError) {
                fileInfo.readError = String(readError);
              }
            }

            debug.files.push(fileInfo);
          } catch (statError) {
            debug.files.push({
              name: file,
              error: String(statError)
            });
          }
        }
      }
    } catch (dirError) {
      debug.error = String(dirError);
    }

    return NextResponse.json({
      success: true,
      debug
    });

  } catch (error) {
    console.error('[Debug] Error:', error);
    return NextResponse.json({
      success: false,
      error: String(error)
    }, { status: 500 });
  }
}
