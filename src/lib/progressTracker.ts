/**
 * File-based progress tracking for long-running API operations
 * Used to provide real-time progress updates to the frontend
 *
 * Uses file storage instead of in-memory Map to ensure progress is shared
 * across all API route handlers (important for Next.js 15 dev mode and serverless)
 */

import { safeReadJsonFile, safeWriteJsonFile } from './fileSystem';

export interface ProgressUpdate {
  requestId: string;
  phase: 1 | 2;
  phaseLabel: string;
  percentage: number;
  current: number;
  total: number;
  timestamp: number;
  completed: boolean;
  error?: string;
  currentBatch?: number;
  totalBatches?: number;
  currentDomainName?: string;
  isWaitingRateLimit?: boolean; // Indicates if waiting for rate limit delay
}

interface ProgressCache {
  [requestId: string]: ProgressUpdate;
}

class ProgressTracker {
  private readonly CACHE_FILE = 'progress-tracker.json';
  private readonly TTL = 5 * 60 * 1000; // 5 minutes TTL for completed requests

  /**
   * Load all progress entries from file
   */
  private async loadProgress(): Promise<ProgressCache> {
    try {
      const data = await safeReadJsonFile<ProgressCache>(this.CACHE_FILE);
      return data || {};
    } catch (error) {
      return {};
    }
  }

  /**
   * Save all progress entries to file
   */
  private async saveProgress(progressCache: ProgressCache): Promise<void> {
    try {
      await safeWriteJsonFile(this.CACHE_FILE, progressCache);
    } catch (error) {
      console.error('[ProgressTracker] Error saving progress to file:', error);
    }
  }

  /**
   * Generate a unique request ID
   */
  generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Initialize progress tracking for a new request
   */
  async initProgress(requestId: string, total: number): Promise<void> {
    const progressCache = await this.loadProgress();
    progressCache[requestId] = {
      requestId,
      phase: 1,
      phaseLabel: 'Obteniendo lista de dominios',
      percentage: 0,
      current: 0,
      total,
      timestamp: Date.now(),
      completed: false
    };
    await this.saveProgress(progressCache);
    console.log(`[ProgressTracker] Initialized progress for ${requestId}: total=${total}`);
  }

  /**
   * Update the total count for a request (useful when transitioning from Phase 1 to Phase 2)
   */
  async updateTotal(requestId: string, total: number): Promise<void> {
    const progressCache = await this.loadProgress();
    const progress = progressCache[requestId];
    if (!progress) {
      console.warn(`[ProgressTracker] No progress found for ${requestId}`);
      return;
    }

    progress.total = total;
    progressCache[requestId] = progress;
    await this.saveProgress(progressCache);
    console.log(`[ProgressTracker] ${requestId}: Updated total to ${total}`);
  }

  /**
   * Update progress for Phase 1 (getting domain list)
   */
  async updatePhase1(requestId: string, percentage: number): Promise<void> {
    const progressCache = await this.loadProgress();
    const progress = progressCache[requestId];
    if (!progress) {
      console.warn(`[ProgressTracker] No progress found for ${requestId}`);
      return;
    }

    progress.phase = 1;
    progress.phaseLabel = 'Obteniendo lista de dominios';
    progress.percentage = Math.round(Math.min(100, Math.max(0, percentage)));
    progress.timestamp = Date.now();

    progressCache[requestId] = progress;
    await this.saveProgress(progressCache);
  }

  /**
   * Update progress for Phase 2 (processing domains)
   */
  async updatePhase2(
    requestId: string,
    current: number,
    total: number,
    currentBatch?: number,
    totalBatches?: number,
    currentDomainName?: string
  ): Promise<void> {
    const progressCache = await this.loadProgress();
    const progress = progressCache[requestId];
    if (!progress) {
      console.warn(`[ProgressTracker] No progress found for ${requestId}`);
      return;
    }

    // Phase 2 goes from 0% to 100% based on actual progress
    const phase2Percentage = total > 0 ? Math.round((current / total) * 100) : 0;

    progress.phase = 2;
    progress.phaseLabel = 'Procesando reglas de seguridad';
    progress.percentage = phase2Percentage;
    progress.current = current;
    progress.total = total;
    progress.currentBatch = currentBatch;
    progress.totalBatches = totalBatches;
    progress.currentDomainName = currentDomainName;
    progress.timestamp = Date.now();

    progressCache[requestId] = progress;
    await this.saveProgress(progressCache);

    const batchInfo = currentBatch && totalBatches ? ` [Lote ${currentBatch}/${totalBatches}]` : '';
    const domainInfo = currentDomainName ? ` - ${currentDomainName}` : '';
    console.log(`[ProgressTracker] ${requestId}: Phase 2 - ${current}/${total} domains (${phase2Percentage}%)${batchInfo}${domainInfo}`);
  }

  /**
   * Set rate limit waiting status
   */
  async setRateLimitWait(requestId: string, isWaiting: boolean): Promise<void> {
    const progressCache = await this.loadProgress();
    const progress = progressCache[requestId];
    if (!progress) {
      console.warn(`[ProgressTracker] No progress found for ${requestId}`);
      return;
    }

    progress.isWaitingRateLimit = isWaiting;
    progressCache[requestId] = progress;
    await this.saveProgress(progressCache);

    if (isWaiting) {
      console.log(`[ProgressTracker] ${requestId}: Waiting for rate limit delay...`);
    }
  }

  /**
   * Mark request as completed
   */
  async markCompleted(requestId: string): Promise<void> {
    const progressCache = await this.loadProgress();
    const progress = progressCache[requestId];
    if (!progress) {
      console.warn(`[ProgressTracker] No progress found for ${requestId}`);
      return;
    }

    progress.completed = true;
    progress.percentage = 100;
    progress.timestamp = Date.now();

    progressCache[requestId] = progress;
    await this.saveProgress(progressCache);
    console.log(`[ProgressTracker] ${requestId}: Marked as completed`);

    // Clean up after TTL (fire and forget)
    setTimeout(async () => {
      const cache = await this.loadProgress();
      delete cache[requestId];
      await this.saveProgress(cache);
      console.log(`[ProgressTracker] ${requestId}: Cleaned up after TTL`);
    }, this.TTL);
  }

  /**
   * Mark request as failed
   */
  async markFailed(requestId: string, error: string): Promise<void> {
    const progressCache = await this.loadProgress();
    const progress = progressCache[requestId];
    if (!progress) {
      console.warn(`[ProgressTracker] No progress found for ${requestId}`);
      return;
    }

    progress.completed = true;
    progress.error = error;
    progress.timestamp = Date.now();

    progressCache[requestId] = progress;
    await this.saveProgress(progressCache);
    console.log(`[ProgressTracker] ${requestId}: Marked as failed - ${error}`);

    // Clean up after TTL (fire and forget)
    setTimeout(async () => {
      const cache = await this.loadProgress();
      delete cache[requestId];
      await this.saveProgress(cache);
      console.log(`[ProgressTracker] ${requestId}: Cleaned up after TTL`);
    }, this.TTL);
  }

  /**
   * Get current progress for a request
   */
  async getProgress(requestId: string): Promise<ProgressUpdate | null> {
    const progressCache = await this.loadProgress();
    const progress = progressCache[requestId];
    if (!progress) {
      return null;
    }

    // Check if progress has expired (older than TTL)
    if (Date.now() - progress.timestamp > this.TTL) {
      delete progressCache[requestId];
      await this.saveProgress(progressCache);
      return null;
    }

    return progress;
  }

  /**
   * Clean up old progress entries
   */
  async cleanup(): Promise<void> {
    const progressCache = await this.loadProgress();
    const now = Date.now();
    let cleaned = 0;

    for (const [requestId, progress] of Object.entries(progressCache)) {
      if (now - progress.timestamp > this.TTL) {
        delete progressCache[requestId];
        cleaned++;
      }
    }

    if (cleaned > 0) {
      await this.saveProgress(progressCache);
      console.log(`[ProgressTracker] Cleaned up ${cleaned} expired progress entries`);
    }
  }
}

// Singleton instance
export const progressTracker = new ProgressTracker();
