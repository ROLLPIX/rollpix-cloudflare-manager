import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { join } from 'path';

const ENV_FILE_PATH = join(process.cwd(), '.env.local');

export async function GET() {
  try {
    const envContent = await fs.readFile(ENV_FILE_PATH, 'utf-8');
    const lines = envContent.split('\n');
    const tokenLine = lines.find(line => line.startsWith('CLOUDFLARE_API_TOKEN='));
    
    if (tokenLine) {
      const token = tokenLine.split('=')[1];
      return NextResponse.json({ token });
    }
    
    return NextResponse.json({ token: null });
  } catch (error) {
    // File doesn't exist or can't be read
    return NextResponse.json({ token: null });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { token, clearCache = true } = await request.json();

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      );
    }

    // Check if token is different from existing token
    let isTokenChanged = false;
    let envContent = '';
    try {
      envContent = await fs.readFile(ENV_FILE_PATH, 'utf-8');
      const lines = envContent.split('\n');
      const existingTokenLine = lines.find(line => line.startsWith('CLOUDFLARE_API_TOKEN='));

      if (existingTokenLine) {
        const existingToken = existingTokenLine.split('=')[1];
        isTokenChanged = existingToken !== token;
      } else {
        isTokenChanged = true; // First time setting token
      }
    } catch (error) {
      // File doesn't exist, this is the first token
      isTokenChanged = true;
    }

    const lines = envContent.split('\n');
    const tokenLineIndex = lines.findIndex(line => line.startsWith('CLOUDFLARE_API_TOKEN='));

    if (tokenLineIndex >= 0) {
      lines[tokenLineIndex] = `CLOUDFLARE_API_TOKEN=${token}`;
    } else {
      lines.push(`CLOUDFLARE_API_TOKEN=${token}`);
    }

    const newContent = lines.filter(line => line.trim() !== '').join('\n') + '\n';
    await fs.writeFile(ENV_FILE_PATH, newContent);

    // If token changed and clearCache is true, clear all cache files
    if (isTokenChanged && clearCache) {
      console.log('[Token API] Token changed, clearing all cache files...');
      try {
        const { PersistentStorage } = await import('@/lib/persistentStorage');
        await PersistentStorage.clearAll();
        console.log('[Token API] Cache cleared successfully');
      } catch (cacheError) {
        console.warn('[Token API] Failed to clear cache:', cacheError);
        // Continue anyway, token was saved
      }
    }

    return NextResponse.json({
      success: true,
      tokenChanged: isTokenChanged,
      cacheCleared: isTokenChanged && clearCache
    });
  } catch (error) {
    console.error('Error saving token:', error);
    return NextResponse.json(
      { error: 'Failed to save token' },
      { status: 500 }
    );
  }
}