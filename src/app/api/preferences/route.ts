import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { join } from 'path';

const PREFERENCES_FILE_PATH = join(process.cwd(), 'user-preferences.json');

export interface UserPreferences {
  perPage: number;
  sortBy: 'name' | 'status';
  filter: 'all' | 'proxied' | 'not-proxied';
  searchTerm: string;
  lastUpdated: string;
}

const defaultPreferences: UserPreferences = {
  perPage: 24,
  sortBy: 'name',
  filter: 'all',
  searchTerm: '',
  lastUpdated: new Date().toISOString()
};

export async function GET() {
  try {
    const preferencesContent = await fs.readFile(PREFERENCES_FILE_PATH, 'utf-8');
    const preferences: UserPreferences = JSON.parse(preferencesContent);
    
    return NextResponse.json(preferences);
  } catch (error) {
    // File doesn't exist or can't be read, return defaults
    return NextResponse.json(defaultPreferences);
  }
}

export async function POST(request: NextRequest) {
  try {
    const preferences: Partial<UserPreferences> = await request.json();
    
    // Load existing preferences and merge with new ones
    let existingPreferences = defaultPreferences;
    try {
      const existingContent = await fs.readFile(PREFERENCES_FILE_PATH, 'utf-8');
      existingPreferences = JSON.parse(existingContent);
    } catch (error) {
      // File doesn't exist, use defaults
    }

    const updatedPreferences: UserPreferences = {
      ...existingPreferences,
      ...preferences,
      lastUpdated: new Date().toISOString()
    };

    await fs.writeFile(PREFERENCES_FILE_PATH, JSON.stringify(updatedPreferences, null, 2));

    return NextResponse.json({ success: true, preferences: updatedPreferences });
  } catch (error) {
    console.error('Error saving preferences:', error);
    return NextResponse.json(
      { error: 'Failed to save preferences' },
      { status: 500 }
    );
  }
}