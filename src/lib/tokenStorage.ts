/**
 * Secure token storage utility using localStorage
 * Implements basic encoding and provides centralized token management
 */
import { useState, useEffect } from 'react';

const TOKEN_KEY = 'rollpix_cf_token';
const TOKEN_TIMESTAMP_KEY = 'rollpix_cf_token_timestamp';

// Token expiry time (7 days in milliseconds)
const TOKEN_EXPIRY = 7 * 24 * 60 * 60 * 1000;

interface TokenData {
  token: string;
  timestamp: number;
}

export const tokenStorage = {
  /**
   * Store token securely in localStorage with timestamp
   * @param token - Cloudflare API token
   */
  setToken: (token: string): void => {
    if (typeof window === 'undefined') return; // SSR safety

    try {
      // Basic encoding (not encryption, just obfuscation)
      const encoded = btoa(token);
      const timestamp = Date.now();

      localStorage.setItem(TOKEN_KEY, encoded);
      localStorage.setItem(TOKEN_TIMESTAMP_KEY, timestamp.toString());

      console.log('Token stored successfully');
    } catch (error) {
      console.error('Failed to store token:', error);
      throw new Error('Failed to store token securely');
    }
  },

  /**
   * Retrieve token from localStorage with expiry check
   * @returns token string or null if not found/expired
   */
  getToken: (): string | null => {
    if (typeof window === 'undefined') return null; // SSR safety

    try {
      const encoded = localStorage.getItem(TOKEN_KEY);
      const timestampStr = localStorage.getItem(TOKEN_TIMESTAMP_KEY);

      if (!encoded || !timestampStr) {
        return null;
      }

      const timestamp = parseInt(timestampStr, 10);
      const now = Date.now();

      // Check if token has expired
      if (now - timestamp > TOKEN_EXPIRY) {
        console.log('Token expired, clearing storage');
        tokenStorage.clearToken();
        return null;
      }

      // Decode and return token
      const token = atob(encoded);
      return token;
    } catch (error) {
      console.error('Failed to retrieve token:', error);
      tokenStorage.clearToken(); // Clear corrupted data
      return null;
    }
  },

  /**
   * Remove token from localStorage
   */
  clearToken: (): void => {
    if (typeof window === 'undefined') return; // SSR safety

    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_TIMESTAMP_KEY);
      console.log('Token cleared from storage');
    } catch (error) {
      console.error('Failed to clear token:', error);
    }
  },

  /**
   * Check if token exists and is not expired
   * @returns boolean indicating if valid token exists
   */
  hasValidToken: (): boolean => {
    return tokenStorage.getToken() !== null;
  },

  /**
   * Get token age in hours
   * @returns hours since token was stored, or null if no token
   */
  getTokenAge: (): number | null => {
    if (typeof window === 'undefined') return null;

    try {
      const timestampStr = localStorage.getItem(TOKEN_TIMESTAMP_KEY);
      if (!timestampStr) return null;

      const timestamp = parseInt(timestampStr, 10);
      const now = Date.now();
      return Math.floor((now - timestamp) / (1000 * 60 * 60)); // Convert to hours
    } catch (error) {
      return null;
    }
  },

  /**
   * Validate token format (basic validation)
   * @param token - Token to validate
   * @returns boolean indicating if token format appears valid
   */
  isValidTokenFormat: (token: string): boolean => {
    if (!token || typeof token !== 'string') return false;

    // Cloudflare API tokens are typically 40 characters long and alphanumeric
    // This is a basic format check, not a real validation
    const cleanToken = token.trim();
    return cleanToken.length >= 40 && /^[a-zA-Z0-9_-]+$/.test(cleanToken);
  }
};

/**
 * React hook for token management
 * Provides reactive token state management
 */
export const useTokenStorage = () => {
  const [token, setTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Load token on mount
    const loadToken = () => {
      try {
        const storedToken = tokenStorage.getToken();
        setTokenState(storedToken);
      } catch (error) {
        console.error('Error loading token:', error);
        setTokenState(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadToken();
  }, []);

  const setToken = (newToken: string) => {
    try {
      tokenStorage.setToken(newToken);
      setTokenState(newToken);
    } catch (error) {
      console.error('Error setting token:', error);
      throw error;
    }
  };

  const clearToken = () => {
    tokenStorage.clearToken();
    setTokenState(null);
  };

  const hasValidToken = tokenStorage.hasValidToken();

  return {
    token,
    isLoading,
    hasValidToken,
    setToken,
    clearToken,
    tokenAge: tokenStorage.getTokenAge()
  };
};

