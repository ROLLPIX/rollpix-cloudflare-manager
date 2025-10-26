'use client';

import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FilterPills } from './FilterPills';

interface DomainTableFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  perPage: number;
  onPerPageChange: (value: number) => void;
  filterPills: {
    proxy: boolean | null;
    underAttack: boolean | null;
    botFight: boolean | null;
    hasRules: boolean | null;
  };
}

export function DomainTableFilters({
  searchTerm,
  onSearchChange,
  perPage,
  onPerPageChange,
  filterPills,
}: DomainTableFiltersProps) {
  return (
    <div className="flex flex-col gap-4 mb-6">
      <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center">
        <div className="lg:w-80">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar dominios..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-10"
              autoComplete="off"
            />
          </div>
        </div>
        <div className="flex-1 flex flex-wrap items-center gap-4">
          <FilterPills />
        </div>
        <div className="flex-shrink-0">
          <Select
            value={perPage === -1 ? 'all' : perPage.toString()}
            onValueChange={(value) => onPerPageChange(value === 'all' ? -1 : parseInt(value))}
          >
            <SelectTrigger className="w-40">
              <div className="flex items-center gap-2">
                <span className="text-sm">📄</span>
                <SelectValue placeholder="Items por página" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25 por página</SelectItem>
              <SelectItem value="50">50 por página</SelectItem>
              <SelectItem value="all">Mostrar todos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}