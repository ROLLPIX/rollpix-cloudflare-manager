import { NextRequest, NextResponse } from 'next/server';
import { CloudflareAPI } from '@/lib/cloudflare';

// GET - Test token permissions
export async function GET(request: NextRequest) {
  try {
    const apiToken = request.headers.get('x-api-token');
    if (!apiToken) {
      return NextResponse.json({
        success: false,
        error: 'API token is required'
      }, { status: 401 });
    }

    const cloudflareAPI = new CloudflareAPI(apiToken);
    const results: any = {};

    // Test 1: Basic zone listing (should work with most tokens)
    try {
      const zonesResponse = await cloudflareAPI.getZones(1, 5);
      results.zones = {
        success: true,
        count: zonesResponse.zones.length,
        sample: zonesResponse.zones[0]?.name || 'No zones'
      };
    } catch (error) {
      results.zones = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }

    // Test 2: Try to get rulesets from multiple zones to show full picture
    if (results.zones.success && results.zones.count > 0) {
      try {
        // Get up to 10 zones to analyze
        const zonesResponse = await cloudflareAPI.getZones(1, 10);
        const zones = zonesResponse.zones;
        
        let totalRulesets = 0;
        let totalCustomRulesets = 0;
        let totalRules = 0;
        const customRulesetsWithCounts = [];
        const zoneDetails = [];
        
        // Check first few zones for rulesets
        const zonesToCheck = zones.slice(0, 3); // Check first 3 zones
        
        for (const zone of zonesToCheck) {
          try {
            const rulesets = await cloudflareAPI.getZoneRulesets(zone.id);
            const customRulesets = rulesets.filter(r => r.phase === 'http_request_firewall_custom');
            
            totalRulesets += rulesets.length;
            totalCustomRulesets += customRulesets.length;
            
            let zoneRulesCount = 0;
            
            // Get actual rule counts for custom rulesets
            for (const ruleset of customRulesets) {
              try {
                const detailedRuleset = await cloudflareAPI.getZoneRuleset(zone.id, ruleset.id);
                const rulesCount = detailedRuleset.rules?.length || 0;
                zoneRulesCount += rulesCount;
                
                customRulesetsWithCounts.push({
                  id: ruleset.id,
                  name: ruleset.name,
                  phase: ruleset.phase,
                  rulesCount: rulesCount,
                  zoneName: zone.name,
                  zoneId: zone.id
                });
              } catch (error) {
                customRulesetsWithCounts.push({
                  id: ruleset.id,
                  name: ruleset.name,
                  phase: ruleset.phase,
                  rulesCount: 0,
                  zoneName: zone.name,
                  zoneId: zone.id
                });
              }
            }
            
            totalRules += zoneRulesCount;
            
            zoneDetails.push({
              id: zone.id,
              name: zone.name,
              rulesetsCount: rulesets.length,
              customRulesetsCount: customRulesets.length,
              rulesCount: zoneRulesCount
            });
            
          } catch (error) {
            console.error(`Error analyzing zone ${zone.name}:`, error);
            zoneDetails.push({
              id: zone.id,
              name: zone.name,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
        
        results.rulesets = {
          success: true,
          totalZonesAnalyzed: zonesToCheck.length,
          totalZonesAvailable: zones.length,
          count: totalRulesets,
          customRulesetsCount: totalCustomRulesets,
          totalRules: totalRules,
          types: customRulesetsWithCounts.length > 0 
            ? customRulesetsWithCounts[0] 
              ? [{ id: 'sample', name: 'http_request_firewall_custom', phase: 'http_request_firewall_custom' }]
              : []
            : [],
          customRulesets: customRulesetsWithCounts,
          zoneDetails: zoneDetails
        };
      } catch (error) {
        results.rulesets = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }

    // Test 3: Get available accounts
    try {
      const accountsResponse = await fetch('https://api.cloudflare.com/client/v4/accounts', {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (accountsResponse.ok) {
        const accountsData = await accountsResponse.json();
        results.accounts = {
          success: true,
          count: accountsData.result?.length || 0,
          accounts: accountsData.result?.map((account: any) => ({
            id: account.id,
            name: account.name,
            type: account.type
          })) || []
        };
      } else {
        const errorText = await accountsResponse.text();
        results.accounts = {
          success: false,
          error: `HTTP ${accountsResponse.status}: ${errorText}`
        };
      }
    } catch (error) {
      results.accounts = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }

    // Test 4: Check token info (if possible)
    try {
      const tokenInfo = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (tokenInfo.ok) {
        const tokenData = await tokenInfo.json();
        results.tokenVerification = {
          success: true,
          data: tokenData
        };
      } else {
        const errorText = await tokenInfo.text();
        results.tokenVerification = {
          success: false,
          error: `HTTP ${tokenInfo.status}: ${errorText}`
        };
      }
    } catch (error) {
      results.tokenVerification = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }

    return NextResponse.json({
      success: true,
      data: results
    });

  } catch (error) {
    console.error('Error testing token:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to test token'
    }, { status: 500 });
  }
}