import { NextRequest, NextResponse } from 'next/server';
import { progressTracker } from '@/lib/progressTracker';

/**
 * GET /api/domains/progress/[requestId]
 * Poll for progress updates on a long-running domain processing request
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const { requestId } = await params;

    if (!requestId) {
      return NextResponse.json({
        success: false,
        error: 'Request ID is required'
      }, { status: 400 });
    }

    const progress = progressTracker.getProgress(requestId);

    if (!progress) {
      return NextResponse.json({
        success: false,
        error: 'Progress not found or expired'
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        phase: progress.phase,
        phaseLabel: progress.phaseLabel,
        percentage: progress.percentage,
        current: progress.current,
        total: progress.total,
        completed: progress.completed,
        error: progress.error,
        currentBatch: progress.currentBatch,
        totalBatches: progress.totalBatches,
        currentDomainName: progress.currentDomainName
      }
    });

  } catch (error) {
    console.error('[Progress API] Error getting progress:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get progress'
    }, { status: 500 });
  }
}
