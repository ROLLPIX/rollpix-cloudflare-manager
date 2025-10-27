/**
 * Tracks cancellation requests for long-running processes
 */

// In-memory set of cancelled request IDs
const cancelledRequests = new Set<string>();

// TTL for cancelled requests (5 minutes)
const CANCELLATION_TTL = 5 * 60 * 1000;

// Map to track when each cancellation was registered
const cancellationTimestamps = new Map<string, number>();

export class CancellationTracker {
  /**
   * Marks a request as cancelled
   */
  static cancel(requestId: string): void {
    cancelledRequests.add(requestId);
    cancellationTimestamps.set(requestId, Date.now());
    console.log(`[CancellationTracker] Request ${requestId} marked for cancellation`);
  }

  /**
   * Checks if a request has been cancelled
   */
  static isCancelled(requestId: string): boolean {
    // Clean up expired cancellations first
    this.cleanup();

    const cancelled = cancelledRequests.has(requestId);
    if (cancelled) {
      console.log(`[CancellationTracker] Request ${requestId} is cancelled`);
    }
    return cancelled;
  }

  /**
   * Removes a cancellation mark (process completed or cleaned up)
   */
  static clear(requestId: string): void {
    cancelledRequests.delete(requestId);
    cancellationTimestamps.delete(requestId);
    console.log(`[CancellationTracker] Cleared cancellation for ${requestId}`);
  }

  /**
   * Cleanup expired cancellation marks
   */
  private static cleanup(): void {
    const now = Date.now();
    for (const [requestId, timestamp] of cancellationTimestamps.entries()) {
      if (now - timestamp > CANCELLATION_TTL) {
        cancelledRequests.delete(requestId);
        cancellationTimestamps.delete(requestId);
        console.log(`[CancellationTracker] Cleaned up expired cancellation for ${requestId}`);
      }
    }
  }

  /**
   * Gets all active cancellations (for debugging)
   */
  static getActiveCancellations(): string[] {
    this.cleanup();
    return Array.from(cancelledRequests);
  }
}
