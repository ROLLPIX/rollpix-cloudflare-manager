'use client';

import { DomainStatus } from '@/types/cloudflare';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { DomainTableSkeleton } from './SkeletonLoader';
import { DomainRow } from './DomainRow';

interface DomainTableContentProps {
  loading: boolean;
  allDomains: DomainStatus[];
  paginatedDomains: DomainStatus[];
  selectedDomains: Set<string>;
  onSelectionChange: (domain: string) => void;
  onSelectAll: (domains: DomainStatus[]) => void;
  onToggleProxy: (zoneId: string, recordId: string, proxied: boolean) => Promise<void>;
  onToggleUnderAttack: (zoneId: string, enabled: boolean) => Promise<void>;
  onToggleBotFight: (zoneId: string, enabled: boolean) => Promise<void>;
  onRefreshDomain: (zoneId: string) => void;
  updatingRecords: Set<string>;
  updatingFirewall: Set<string>;
  refreshingDomainId: string | null;
}

export function DomainTableContent({
  loading,
  allDomains,
  paginatedDomains,
  selectedDomains,
  onSelectionChange,
  onSelectAll,
  onToggleProxy,
  onToggleUnderAttack,
  onToggleBotFight,
  onRefreshDomain,
  updatingRecords,
  updatingFirewall,
  refreshingDomainId,
}: DomainTableContentProps) {
  if (loading && allDomains.length === 0) {
    return <DomainTableSkeleton rows={8} />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">
            <Checkbox
              checked={selectedDomains.size === paginatedDomains.length && paginatedDomains.length > 0}
              onCheckedChange={() => onSelectAll(paginatedDomains)}
            />
          </TableHead>
          <TableHead>Dominio</TableHead>
          <TableHead>DNS</TableHead>
          <TableHead>Firewall</TableHead>
          <TableHead>Reglas de Seguridad</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {paginatedDomains.map((domain) => (
          <DomainRow
            key={domain.zoneId}
            domain={domain}
            isSelected={selectedDomains.has(domain.domain)}
            onSelectionChange={onSelectionChange}
            onToggleProxy={onToggleProxy}
            onToggleUnderAttack={onToggleUnderAttack}
            onToggleBotFight={onToggleBotFight}
            onRefreshDomain={onRefreshDomain}
            updatingRecords={updatingRecords}
            updatingFirewall={updatingFirewall}
            refreshingDomainId={refreshingDomainId}
          />
        ))}
      </TableBody>
    </Table>
  );
}