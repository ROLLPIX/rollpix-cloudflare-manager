/**
 * Settings storage utility for managing user preferences in localStorage
 */

export interface AppSettings {
  apiRateLimiting: {
    batchSize: number;
    batchDelay: number; // in milliseconds
  };
  theme: 'light' | 'dark' | 'system';
  lastUpdated: string;
}

const SETTINGS_KEY = 'rollpix-app-settings';

// Default settings optimized for Cloudflare's 1200 req/5min limit
const DEFAULT_SETTINGS: AppSettings = {
  apiRateLimiting: {
    batchSize: 4,
    batchDelay: 6000 // 6 seconds
  },
  theme: 'system',
  lastUpdated: new Date().toISOString()
};

class SettingsStorage {
  /**
   * Get all settings from localStorage
   */
  getSettings(): AppSettings {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (!stored) {
        return DEFAULT_SETTINGS;
      }

      const parsed = JSON.parse(stored);
      // Merge with defaults to ensure all properties exist
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        apiRateLimiting: {
          ...DEFAULT_SETTINGS.apiRateLimiting,
          ...(parsed.apiRateLimiting || {})
        }
      };
    } catch (error) {
      console.error('[SettingsStorage] Error reading settings:', error);
      return DEFAULT_SETTINGS;
    }
  }

  /**
   * Save settings to localStorage
   */
  saveSettings(settings: Partial<AppSettings>): void {
    try {
      const current = this.getSettings();
      const updated: AppSettings = {
        ...current,
        ...settings,
        lastUpdated: new Date().toISOString()
      };

      // Deep merge for nested objects
      if (settings.apiRateLimiting) {
        updated.apiRateLimiting = {
          ...current.apiRateLimiting,
          ...settings.apiRateLimiting
        };
      }

      localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
      console.log('[SettingsStorage] Settings saved:', updated);
    } catch (error) {
      console.error('[SettingsStorage] Error saving settings:', error);
    }
  }

  /**
   * Get API rate limiting settings
   */
  getRateLimiting(): { batchSize: number; batchDelay: number } {
    const settings = this.getSettings();
    return settings.apiRateLimiting;
  }

  /**
   * Update API rate limiting settings
   */
  setRateLimiting(batchSize: number, batchDelay: number): void {
    this.saveSettings({
      apiRateLimiting: { batchSize, batchDelay }
    });
  }

  /**
   * Get theme preference
   */
  getTheme(): 'light' | 'dark' | 'system' {
    const settings = this.getSettings();
    return settings.theme;
  }

  /**
   * Set theme preference
   */
  setTheme(theme: 'light' | 'dark' | 'system'): void {
    this.saveSettings({ theme });
  }

  /**
   * Reset to default settings
   */
  resetToDefaults(): void {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS));
    console.log('[SettingsStorage] Settings reset to defaults');
  }

  /**
   * Clear all settings
   */
  clearSettings(): void {
    localStorage.removeItem(SETTINGS_KEY);
    console.log('[SettingsStorage] Settings cleared');
  }
}

export const settingsStorage = new SettingsStorage();
