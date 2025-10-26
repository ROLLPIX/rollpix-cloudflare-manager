'use client';

import React from 'react';
import { DomainStatus } from '@/types/cloudflare';
import { TableCell, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { RulePillsDisplay } from './RulePill';
import { DNSPills } from './DNSPills';
import { FirewallControls } from './FirewallControls';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

interface DomainRowProps {
  domain: DomainStatus;
  isSelected: boolean;
  onSelectionChange: (domain: string) => void;
  onToggleProxy: (zoneId: string, recordId: string, proxied: boolean) => Promise<void>;
  onToggleUnderAttack: (zoneId: string, enabled: boolean) => Promise<void>;
  onToggleBotFight: (zoneId: string, enabled: boolean) => Promise<void>;
  onRefreshDomain: (zoneId: string) => Promise<void>;
  updatingRecords: Set<string>;
  updatingFirewall: Set<string>;
  refreshingDomainId: string | null;
}

export const DomainRow = React.memo<DomainRowProps>(({
  domain,
  isSelected,
  onSelectionChange,
  onToggleProxy,
  onToggleUnderAttack,
  onToggleBotFight,
  onRefreshDomain,
  updatingRecords,
  updatingFirewall,
  refreshingDomainId,
}) => {
  // Convert templateRules to rulePills format for display
  const rulePills = React.useMemo(() => {
    if (domain.rulePills) {
      return domain.rulePills;
    }

    // Convert from securityRules.templateRules to RulePillData format
    if (domain.securityRules?.templateRules) {
      return domain.securityRules.templateRules.map(rule => {
        // Truncate expression to first 30 characters
        const truncatedExpression = rule.expression
          ? (rule.expression.length > 30
              ? rule.expression.substring(0, 30) + '...'
              : rule.expression)
          : 'Template rule';

        return {
          id: rule.friendlyId,
          name: rule.name,
          version: rule.version,
          domainVersion: rule.version,
          isUpdated: !rule.isOutdated,
          action: rule.action || 'unknown',
          type: 'firewall_custom',
          expression: truncatedExpression,
          lastUpdated: new Date(domain.securityRules?.lastAnalyzed || Date.now()),
          templateId: rule.friendlyId
        };
      });
    }

    return [];
  }, [domain.rulePills, domain.securityRules]);

  return (
    <TableRow>
      <TableCell>
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onSelectionChange(domain.domain)}
        />
      </TableCell>
      <TableCell className="font-medium">{domain.domain}</TableCell>
      <TableCell>
        <DNSPills
          domain={domain}
          onToggleProxy={onToggleProxy}
          updatingRecords={updatingRecords}
        />
      </TableCell>
      <TableCell>
        <FirewallControls
          domain={domain}
          onToggleUnderAttack={onToggleUnderAttack}
          onToggleBotFight={onToggleBotFight}
          updatingUnderAttack={updatingFirewall.has(`${domain.zoneId}-under_attack`)}
          updatingBotFight={updatingFirewall.has(`${domain.zoneId}-bot_fight`)}
        />
      </TableCell>
      <TableCell>
        <RulePillsDisplay
          rules={rulePills}
          domainId={domain.zoneId}
        />
      </TableCell>
      <TableCell className="text-right">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRefreshDomain(domain.zoneId)}
          disabled={refreshingDomainId === domain.zoneId}
        >
          <RefreshCw className={`h-4 w-4 ${refreshingDomainId === domain.zoneId ? 'animate-spin' : ''}`} />
        </Button>
      </TableCell>
    </TableRow>
  );
});

DomainRow.displayName = 'DomainRow';