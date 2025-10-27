import { NextRequest, NextResponse } from 'next/server';
import { CancellationTracker } from '@/lib/cancellationTracker';

/**
 * POST /api/domains/cancel
 * Cancels an in-progress domain refresh operation
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { requestId } = body;

    if (!requestId) {
      return NextResponse.json({
        success: false,
        error: 'requestId is required'
      }, { status: 400 });
    }

    // Mark the request as cancelled
    CancellationTracker.cancel(requestId);

    console.log(`[Cancel API] Cancellation requested for ${requestId}`);

    return NextResponse.json({
      success: true,
      message: `Request ${requestId} has been marked for cancellation`,
      requestId
    });

  } catch (error) {
    console.error('[Cancel API] Error cancelling request:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
