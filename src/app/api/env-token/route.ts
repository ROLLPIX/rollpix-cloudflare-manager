import { NextResponse } from 'next/server';

/**
 * GET - Check if CLOUDFLARE_API_TOKEN exists in environment variables
 * This endpoint does NOT return the actual token for security reasons
 * It only returns whether a token exists and if it's valid format
 */
export async function GET() {
  try {
    const envToken = process.env.CLOUDFLARE_API_TOKEN;

    if (!envToken) {
      return NextResponse.json({
        hasToken: false,
        message: 'No environment token configured'
      });
    }

    // Validate token format (should be at least 40 characters)
    const isValidFormat = envToken.length >= 40;

    if (!isValidFormat) {
      console.warn('[ENV Token] Token exists but has invalid format (< 40 chars)');
      return NextResponse.json({
        hasToken: false,
        message: 'Environment token has invalid format'
      });
    }

    // Return masked token for display purposes (first 8 chars + ...)
    const maskedToken = `${envToken.substring(0, 8)}...`;

    return NextResponse.json({
      hasToken: true,
      maskedToken,
      message: 'Environment token available'
    });
  } catch (error) {
    console.error('[ENV Token] Error checking environment token:', error);
    return NextResponse.json(
      {
        hasToken: false,
        error: 'Error checking environment token'
      },
      { status: 500 }
    );
  }
}

/**
 * POST - Get the actual environment token
 * This is a separate endpoint to make it explicit when the token is being retrieved
 */
export async function POST() {
  try {
    const envToken = process.env.CLOUDFLARE_API_TOKEN;

    if (!envToken) {
      return NextResponse.json(
        {
          success: false,
          error: 'No environment token configured'
        },
        { status: 404 }
      );
    }

    // Validate token format
    const isValidFormat = envToken.length >= 40;

    if (!isValidFormat) {
      return NextResponse.json(
        {
          success: false,
          error: 'Environment token has invalid format'
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      token: envToken
    });
  } catch (error) {
    console.error('[ENV Token] Error retrieving environment token:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Error retrieving environment token'
      },
      { status: 500 }
    );
  }
}
