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
      // Try the official Bot Management API endpoint first
      try {
        // First, get current configuration
        const getCurrentResponse = await fetch(
          `https://api.cloudflare.com/client/v4/zones/${zoneId}/bot_management`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${apiToken}`,
              'Content-Type': 'application/json',
            }
          }
        );

        if (!getCurrentResponse.ok) {
          const errorData = await getCurrentResponse.json();

          // Check if it's a permission issue (403 with Authentication error)
          if (getCurrentResponse.status === 403 && errorData.errors?.[0]?.code === 10000) {
            return NextResponse.json({
              success: false,
              mode,
              enabled: false,
              zoneId,
              error: 'El token API no tiene permisos de "Bot Management Read/Write". Actualiza el token para incluir estos permisos.',
              errorCode: 'INSUFFICIENT_PERMISSIONS',
              requiredPermissions: ['Bot Management:Read', 'Bot Management:Write'],
              helpUrl: 'https://developers.cloudflare.com/fundamentals/api/get-started/create-token/',
              details: errorData
            });
          }

          return NextResponse.json({
            success: false,
            mode,
            enabled: false,
            zoneId,
            error: 'No se puede acceder a la configuración de Bot Management.',
            errorCode: 'ACCESS_DENIED',
            details: errorData
          });
        }

        const currentConfig = await getCurrentResponse.json();

        // Update configuration with Bot Fight Mode
        const updateConfig = {
          ...currentConfig.result,
          fight_mode: enabled,
          enable_js: enabled,
          // Set appropriate actions for Bot Fight Mode
          sbfm_likely_automated: enabled ? 'challenge' : 'allow',
          sbfm_definitely_automated: enabled ? 'block' : 'allow',
          sbfm_verified_bots: 'allow', // Always allow verified bots
        };

        response = await fetch(
          `https://api.cloudflare.com/client/v4/zones/${zoneId}/bot_management`,
          {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${apiToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(updateConfig)
          }
        );

        if (!response.ok) {
          const errorData = await response.json();

          // Check if Bot Fight Mode is not available for this plan
          if (errorData.errors?.[0]?.code === 1003 || errorData.errors?.[0]?.message?.includes('not available')) {
            return NextResponse.json({
              success: false,
              mode,
              enabled: false,
              zoneId,
              error: 'Bot Fight Mode no está disponible para este plan. Actualiza a Pro, Business o Enterprise.',
              errorCode: 'FEATURE_NOT_AVAILABLE',
              planUpgradeUrl: `https://dash.cloudflare.com/zones/${zoneId}/billing`
            });
          }

          return NextResponse.json({
            success: false,
            mode,
            enabled: false,
            zoneId,
            error: 'Error al actualizar Bot Fight Mode.',
            details: errorData
          });
        }

      } catch (error) {
        // Try fallback methods for accounts without Bot Management API access
        console.log(`[Bot Fight Toggle] Trying fallback methods for zone ${zoneId}...`);

        const fallbackEndpoints = [
          'bot_fight_mode',
          'bfm',
          'challenge_passage'
        ];

        let fallbackSuccess = false;
        let fallbackError = null;

        for (const settingName of fallbackEndpoints) {
          try {
            const fallbackResponse = await fetch(
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

            if (fallbackResponse.ok) {
              response = fallbackResponse;
              fallbackSuccess = true;
              console.log(`[Bot Fight Toggle] Success via fallback endpoint: ${settingName}`);
              break;
            }

            fallbackError = await fallbackResponse.json();
          } catch (fallbackErr) {
            fallbackError = fallbackErr;
            continue;
          }
        }

        if (!fallbackSuccess) {
          return NextResponse.json({
            success: false,
            mode,
            enabled: false,
            zoneId,
            error: 'Bot Fight Mode requiere permisos especiales del token API o configuración desde el dashboard.',
            errorCode: 'FALLBACK_FAILED',
            suggestion: 'Configura Bot Fight Mode desde el dashboard de Cloudflare o actualiza los permisos del token.',
            dashboardUrl: `https://dash.cloudflare.com/zones/${zoneId}/security/bots`,
            details: fallbackError
          });
        }
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

    // Get bot fight mode using official Bot Management API with fallback
    let botFightData = null;
    let botFightStatus = 'unknown';
    let botFightMode = false;

    // Try official Bot Management API first
    try {
      const botFightResponse = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${zoneId}/bot_management`,
        {
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (botFightResponse.ok) {
        botFightData = await botFightResponse.json();
        const result = botFightData.result;

        // Determine if Bot Fight Mode is enabled - use precise logic to avoid false positives
        // Basic Bot Fight Mode is primarily indicated by fight_mode
        botFightMode = !!(result.fight_mode);

        // If fight_mode is not set, check for other reliable indicators
        if (!botFightMode) {
          // Super Bot Fight Mode indicators (more conservative)
          const hasSuperBotFight = !!(
            (result.sbfm_likely_automated && result.sbfm_likely_automated !== 'allow') ||
            (result.sbfm_definitely_automated && result.sbfm_definitely_automated !== 'allow')
          );

          // Only consider it Bot Fight Mode if we have clear Super Bot Fight indicators
          // and enable_js is also true (more conservative approach)
          if (hasSuperBotFight && result.enable_js) {
            botFightMode = true;
          }
        }

        botFightStatus = 'official_api';
      } else {
        const errorData = await botFightResponse.json();

        // Check if it's a permission issue
        if (botFightResponse.status === 403 && errorData.errors?.[0]?.code === 10000) {
          botFightStatus = 'insufficient_permissions';
          console.warn(`Bot Fight Mode: Token lacks Bot Management Read permission for zone ${zoneId}`);
        } else {
          botFightStatus = `error_${botFightResponse.status}`;
          console.warn(`Bot Fight Mode API error for zone ${zoneId}:`, errorData);
        }
      }
    } catch (error) {
      botFightStatus = 'network_error';
      console.error(`Bot Fight Mode network error for zone ${zoneId}:`, error);
    }

    // If official API failed due to permissions, try fallback methods
    if (botFightStatus === 'insufficient_permissions' || botFightStatus === 'network_error') {
      console.log(`[Bot Fight Read] Trying fallback methods for zone ${zoneId}...`);

      const fallbackEndpoints = [
        'bot_fight_mode',
        'bfm',
        'challenge_passage'
      ];

      for (const settingName of fallbackEndpoints) {
        try {
          const fallbackResponse = await fetch(
            `https://api.cloudflare.com/client/v4/zones/${zoneId}/settings/${settingName}`,
            {
              headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json',
              },
            }
          );

          if (fallbackResponse.ok) {
            const fallbackData = await fallbackResponse.json();
            if (fallbackData.result?.value === 'on') {
              botFightMode = true;
              botFightStatus = `fallback_${settingName}`;
              botFightData = fallbackData;
              console.log(`[Bot Fight Read] Found via fallback: ${settingName}`);
              break;
            }
          }
        } catch (fallbackError) {
          // Continue trying other fallback endpoints
          continue;
        }
      }

      // If no fallback worked, default to false but indicate limitation
      if (botFightStatus === 'insufficient_permissions' && !botFightMode) {
        botFightStatus = 'permissions_required';
      }
    }

    return NextResponse.json({
      zoneId,
      underAttackMode: securityLevelData?.result?.value === 'under_attack',
      botFightMode,
      securityLevel: securityLevelData?.result?.value || 'unknown',
      botFightStatus,
      debug: {
        hasSecurityLevelData: !!securityLevelData,
        hasBotFightData: !!botFightData,
        botFightData: botFightData?.result,
        apiEndpoint: 'zones/:zone_id/bot_management'
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
