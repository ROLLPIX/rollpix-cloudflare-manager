/**
 * In-memory progress tracking for long-running API operations
 * Used to provide real-time progress updates to the frontend
 */

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
}

class ProgressTracker {
  private progressMap: Map<string, ProgressUpdate> = new Map();
  private readonly TTL = 5 * 60 * 1000; // 5 minutes TTL for completed requests

  /**
   * Generate a unique request ID
   */
  generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Initialize progress tracking for a new request
   */
  initProgress(requestId: string, total: number): void {
    this.progressMap.set(requestId, {
      requestId,
      phase: 1,
      phaseLabel: 'Obteniendo lista de dominios',
      percentage: 0,
      current: 0,
      total,
      timestamp: Date.now(),
      completed: false
    });
    console.log(`[ProgressTracker] Initialized progress for ${requestId}: total=${total}`);
  }

  /**
   * Update the total count for a request (useful when transitioning from Phase 1 to Phase 2)
   */
  updateTotal(requestId: string, total: number): void {
    const progress = this.progressMap.get(requestId);
    if (!progress) {
      console.warn(`[ProgressTracker] No progress found for ${requestId}`);
      return;
    }

    progress.total = total;
    this.progressMap.set(requestId, progress);
    console.log(`[ProgressTracker] ${requestId}: Updated total to ${total}`);
  }

  /**
   * Update progress for Phase 1 (getting domain list)
   */
  updatePhase1(requestId: string, percentage: number): void {
    const progress = this.progressMap.get(requestId);
    if (!progress) {
      console.warn(`[ProgressTracker] No progress found for ${requestId}`);
      return;
    }

    progress.phase = 1;
    progress.phaseLabel = 'Obteniendo lista de dominios';
    progress.percentage = Math.min(100, Math.max(0, percentage));
    progress.timestamp = Date.now();

    this.progressMap.set(requestId, progress);
  }

  /**
   * Update progress for Phase 2 (processing domains)
   */
  updatePhase2(
    requestId: string,
    current: number,
    total: number,
    currentBatch?: number,
    totalBatches?: number,
    currentDomainName?: string
  ): void {
    const progress = this.progressMap.get(requestId);
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

    this.progressMap.set(requestId, progress);

    const batchInfo = currentBatch && totalBatches ? ` [Lote ${currentBatch}/${totalBatches}]` : '';
    const domainInfo = currentDomainName ? ` - ${currentDomainName}` : '';
    console.log(`[ProgressTracker] ${requestId}: Phase 2 - ${current}/${total} domains (${phase2Percentage}%)${batchInfo}${domainInfo}`);
  }

  /**
   * Mark request as completed
   */
  markCompleted(requestId: string): void {
    const progress = this.progressMap.get(requestId);
    if (!progress) {
      console.warn(`[ProgressTracker] No progress found for ${requestId}`);
      return;
    }

    progress.completed = true;
    progress.percentage = 100;
    progress.timestamp = Date.now();

    this.progressMap.set(requestId, progress);
    console.log(`[ProgressTracker] ${requestId}: Marked as completed`);

    // Clean up after TTL
    setTimeout(() => {
      this.progressMap.delete(requestId);
      console.log(`[ProgressTracker] ${requestId}: Cleaned up after TTL`);
    }, this.TTL);
  }

  /**
   * Mark request as failed
   */
  markFailed(requestId: string, error: string): void {
    const progress = this.progressMap.get(requestId);
    if (!progress) {
      console.warn(`[ProgressTracker] No progress found for ${requestId}`);
      return;
    }

    progress.completed = true;
    progress.error = error;
    progress.timestamp = Date.now();

    this.progressMap.set(requestId, progress);
    console.log(`[ProgressTracker] ${requestId}: Marked as failed - ${error}`);

    // Clean up after TTL
    setTimeout(() => {
      this.progressMap.delete(requestId);
      console.log(`[ProgressTracker] ${requestId}: Cleaned up after TTL`);
    }, this.TTL);
  }

  /**
   * Get current progress for a request
   */
  getProgress(requestId: string): ProgressUpdate | null {
    const progress = this.progressMap.get(requestId);
    if (!progress) {
      return null;
    }

    // Check if progress has expired (older than TTL)
    if (Date.now() - progress.timestamp > this.TTL) {
      this.progressMap.delete(requestId);
      return null;
    }

    return progress;
  }

  /**
   * Clean up old progress entries
   */
  cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [requestId, progress] of this.progressMap.entries()) {
      if (now - progress.timestamp > this.TTL) {
        this.progressMap.delete(requestId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[ProgressTracker] Cleaned up ${cleaned} expired progress entries`);
    }
  }
}

// Singleton instance
export const progressTracker = new ProgressTracker();

// Run cleanup every minute
if (typeof setInterval !== 'undefined') {
  setInterval(() => progressTracker.cleanup(), 60000);
}
