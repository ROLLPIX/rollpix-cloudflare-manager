'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Shield, ShieldCheck, Zap, Bot, X, Siren } from 'lucide-react';
import { useDomainStore, type FilterPills } from '@/store/domainStore';

type PillState = 'inactive' | 'active' | 'negative';

interface FilterPillProps {
  type: keyof FilterPills;
  value: boolean | null;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}

function FilterPill({ type, value, label, icon, onClick }: FilterPillProps) {
  let state: PillState = 'inactive';
  let className = 'border-gray-200 text-gray-600 hover:border-gray-300';

  if (value === true) {
    state = 'active';
    className = 'border-green-500 bg-green-50 text-green-700 hover:border-green-600';
  } else if (value === false) {
    state = 'negative';
    className = 'border-red-500 bg-red-50 text-red-700 hover:border-red-600';
  }

  return (
    <Badge
      variant="outline"
      className={`cursor-pointer transition-colors ${className} px-3 py-1.5 text-sm font-medium min-w-[90px] flex items-center justify-center`}
      onClick={onClick}
    >
      <span className="mr-1.5">{icon}</span>
      {label}
      <span className="ml-1 text-xs w-3 flex justify-center">
        {state === 'active' && '✓'}
        {state === 'negative' && '✗'}
      </span>
    </Badge>
  );
}

export function FilterPills() {
  const { filterPills, toggleFilterPill, clearAllFilters } = useDomainStore();

  const hasActiveFilters = Object.values(filterPills).some(value => value !== null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-gray-700 mr-2">Filtros:</span>

      <FilterPill
        type="proxy"
        value={filterPills.proxy}
        label="Proxy"
        icon={<Zap className="h-3 w-3" />}
        onClick={() => toggleFilterPill('proxy')}
      />

      <FilterPill
        type="underAttack"
        value={filterPills.underAttack}
        label="Under Attack"
        icon={<Siren className="h-3 w-3" />}
        onClick={() => toggleFilterPill('underAttack')}
      />

      <FilterPill
        type="botFight"
        value={filterPills.botFight}
        label="Bot Fight"
        icon={<Bot className="h-3 w-3" />}
        onClick={() => toggleFilterPill('botFight')}
      />

      <FilterPill
        type="hasRules"
        value={filterPills.hasRules}
        label="Reglas"
        icon={<ShieldCheck className="h-3 w-3" />}
        onClick={() => toggleFilterPill('hasRules')}
      />

      <div className="w-16"> {/* Reserved space to prevent layout shift */}
        {hasActiveFilters && (
          <Button
            variant="outline"
            size="sm"
            onClick={clearAllFilters}
            className="h-7 px-2 text-xs text-gray-500 hover:text-gray-700"
          >
            <X className="h-3 w-3 mr-1" />
            Limpiar
          </Button>
        )}
      </div>
    </div>
  );
}