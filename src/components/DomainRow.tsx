'use client';

import React from 'react';
import { DomainStatus } from '@/types/cloudflare';
import { TableCell, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RefreshCw } from 'lucide-react';
import { SecurityRulesIndicator } from './SecurityRulesIndicator';
import { DNSPills } from './DNSPills';
import { FirewallControls } from './FirewallControls';

interface DomainRowProps {
  domain: DomainStatus;
  isSelected: boolean;
  onSelectionChange: (domain: string) => void;
  onToggleProxy: (zoneId: string, recordId: string, proxied: boolean) => Promise<void>;
  onToggleUnderAttack: (zoneId: string, enabled: boolean) => Promise<void>;
  onToggleBotFight: (zoneId: string, enabled: boolean) => Promise<void>;
  onRefreshDomain: (zoneId: string) => void;
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
        <SecurityRulesIndicator domain={domain} compact />
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