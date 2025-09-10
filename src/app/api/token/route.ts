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
    const { token } = await request.json();
    
    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      );
    }

    let envContent = '';
    try {
      envContent = await fs.readFile(ENV_FILE_PATH, 'utf-8');
    } catch (error) {
      // File doesn't exist, create new content
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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving token:', error);
    return NextResponse.json(
      { error: 'Failed to save token' },
      { status: 500 }
    );
  }
}