'use client';

import { DomainStatus } from '@/types/cloudflare';
import { RulesActionBar } from './RulesActionBar';

interface DomainTableActionsProps {
  selectedDomains: Set<string>;
  allDomains: DomainStatus[];
  onClearSelection: () => void;
  onRefreshSelected: (zoneIds: string[]) => Promise<void>;
  onBulkProxy: (enable: boolean) => Promise<void>;
  onBulkUnderAttack: (enable: boolean) => Promise<void>;
  onBulkBotFight: (enable: boolean) => Promise<void>;
}

export function DomainTableActions({
  selectedDomains,
  allDomains,
  onClearSelection,
  onRefreshSelected,
  onBulkProxy,
  onBulkUnderAttack,
  onBulkBotFight,
}: DomainTableActionsProps) {
  const selectedZoneIds = allDomains
    .filter(d => selectedDomains.has(d.domain))
    .map(d => d.zoneId);

  return (
    <RulesActionBar
      selectedDomains={selectedZoneIds}
      onClearSelection={onClearSelection}
      onRefreshSelectedDomains={() => onRefreshSelected(selectedZoneIds)}
      onBulkProxy={onBulkProxy}
      onBulkUnderAttack={onBulkUnderAttack}
      onBulkBotFight={onBulkBotFight}
    />
  );
}