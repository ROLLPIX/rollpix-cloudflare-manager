import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { SecurityModeSchema, ApiTokenSchema, validateApiRequest, createValidationErrorResponse } from '@/lib/validation';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate request body
    let validatedData;
    try {
      validatedData = validateApiRequest(SecurityModeSchema, body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          createValidationErrorResponse(error),
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      );
    }

    const { zoneId, mode, enabled } = validatedData;

    // Validate API token
    const apiToken = request.headers.get('x-api-token');
    if (!apiToken) {
      return NextResponse.json(
        { error: 'API token is required' },
        { status: 401 }
      );
    }

    try {
      validateApiRequest(ApiTokenSchema, apiToken);
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid API token format' },
        { status: 401 }
      );
    }

    let response;

    if (mode === 'under_attack') {
      // Under Attack mode uses zone settings
      response = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${zoneId}/settings/security_level`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            value: enabled ? 'under_attack' : 'medium'
          }),
        }
      );
    } else if (mode === 'bot_fight') {
      // Bot Fight Mode uses a different endpoint
      // Try the zone settings first with common names
      const botFightEndpoints = [
        'bot_fight_mode',
        'bfm',
        'bot_management',
        'challenge_passage'
      ];

      let success = false;
      let lastError = null;

      for (const settingName of botFightEndpoints) {
        try {
          response = await fetch(
            `https://api.cloudflare.com/client/v4/zones/${zoneId}/settings/${settingName}`,
            {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                value: enabled ? 'on' : 'off'
              }),
            }
          );

          if (response.ok) {
            success = true;
            break;
          }

          lastError = await response.json();
        } catch (error) {
          lastError = error;
        }
      }

      if (!success) {
        // Bot Fight Mode may need to be configured through the dashboard
        return NextResponse.json({
          success: false,
          mode,
          enabled: false,
          zoneId,
          error: 'Bot Fight Mode debe configurarse desde el dashboard de Cloudflare. Visita Security > Bots para activarlo.',
          errorCode: 'DASHBOARD_ONLY',
          dashboardUrl: `https://dash.cloudflare.com/zones/${zoneId}/security/bots`,
          details: lastError
        });
      }
    } else {
      return NextResponse.json(
        { error: 'Invalid mode. Use "under_attack" or "bot_fight"' },
        { status: 400 }
      );
    }

    if (!response || !response.ok) {
      const errorData = response ? await response.json() : { error: 'No response received' };
      console.error(`Error updating ${mode} mode:`, errorData);

      // Handle specific error for bot_fight_mode not being available
      if (mode === 'bot_fight' && errorData.errors?.[0]?.code === 1003) {
        return NextResponse.json({
          success: false,
          mode,
          enabled: false,
          zoneId,
          error: 'Bot Fight Mode no está disponible para este tipo de cuenta',
          errorCode: 'FEATURE_NOT_AVAILABLE'
        });
      }

      return NextResponse.json(
        { error: `Failed to update ${mode} mode`, details: errorData },
        { status: response?.status || 500 }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      mode,
      enabled,
      zoneId,
      data: data.result
    });

  } catch (error) {
    console.error('Error en la API de modo de seguridad:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const zoneId = searchParams.get('zoneId');

    if (!zoneId) {
      return NextResponse.json(
        { error: 'Zone ID is required' },
        { status: 400 }
      );
    }

    const apiToken = request.headers.get('x-api-token');
    if (!apiToken) {
      return NextResponse.json(
        { error: 'API token is required' },
        { status: 401 }
      );
    }

    // Get security level (should be available for all accounts)
    let securityLevelData = null;
    try {
      const securityLevelResponse = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${zoneId}/settings/security_level`,
        {
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      if (securityLevelResponse.ok) {
        securityLevelData = await securityLevelResponse.json();
      }
    } catch (error) {
      console.error('Error fetching security_level:', error);
    }

    // Get bot fight mode - try multiple possible endpoints
    let botFightData = null;
    let botFightStatus = 'unknown';

    const botFightEndpoints = [
      'bot_fight_mode',
      'bfm',
      'bot_management',
      'challenge_passage'
    ];

    for (const settingName of botFightEndpoints) {
      try {
        const botFightResponse = await fetch(
          `https://api.cloudflare.com/client/v4/zones/${zoneId}/settings/${settingName}`,
          {
            headers: {
              'Authorization': `Bearer ${apiToken}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (botFightResponse.ok) {
          botFightData = await botFightResponse.json();
          botFightStatus = `found_as_${settingName}`;
          break;
        }
      } catch (error) {
        // Continue trying other endpoints
        continue;
      }
    }

    if (!botFightData) {
      console.info(`Bot Fight Mode not found in any of the tested endpoints for zone ${zoneId}`);
    }

    return NextResponse.json({
      zoneId,
      underAttackMode: securityLevelData?.result?.value === 'under_attack',
      botFightMode: botFightData?.result?.value === 'on',
      securityLevel: securityLevelData?.result?.value || 'unknown',
      botFightValue: botFightData?.result?.value || 'unknown',
      botFightStatus,
      debug: {
        hasSecurityLevelData: !!securityLevelData,
        hasBotFightData: !!botFightData,
        testedEndpoints: botFightEndpoints
      }
    });

  } catch (error) {
    console.error('Error al obtener la configuración del modo de seguridad:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
