'use client';

import { useEffect, useMemo } from 'react';
import { DomainStatus } from '@/types/cloudflare';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { RefreshCw, Loader2, Search, Filter, ArrowUpDown, ChevronDown, Globe } from 'lucide-react';
import { SecurityRulesIndicator } from './SecurityRulesIndicator';
import { RulesActionBar } from './RulesActionBar';
import { DNSPills } from './DNSPills';
import { FirewallControls } from './FirewallControls';
import { useDomainStore, FilterType, SortType } from '@/store/domainStore';

export function DomainTable() {
  const {
    allDomains,
    loading,
    loadingProgress,
    isBackgroundRefreshing,
    selectedDomains,
    currentPage,
    perPage,
    searchTerm,
    filter,
    sortBy,
    totalCount,
    lastUpdate,
    refreshingDomainId,
    initializeDomains,
    fetchFromCloudflare,
    setSearchTerm,
    setFilter,
    setSortBy,
    setCurrentPage,
    setPerPage,
    toggleDomainSelection,
    selectAllDomains,
    clearDomainSelection,
  } = useDomainStore();

  useEffect(() => {
    initializeDomains();
  }, [initializeDomains]);

  const processedDomains = useMemo(() => {
    let processed = [...allDomains];
    if (searchTerm) {
      processed = processed.filter(domain =>
        domain.domain.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    if (filter !== 'all') {
      processed = processed.filter(domain => {
        const hasProxiedRecord = domain.rootProxied || domain.wwwProxied;
        return filter === 'proxied' ? hasProxiedRecord : !hasProxiedRecord;
      });
    }
    processed.sort((a, b) => {
      if (sortBy === 'name') {
        return a.domain.localeCompare(b.domain);
      } else {
        const getStatusPriority = (domain: DomainStatus) => {
          const hasAnyRecord = !!domain.rootRecord || !!domain.wwwRecord;
          const hasAnyProxy = domain.rootProxied || domain.wwwProxied;
          if (hasAnyRecord && !hasAnyProxy) return 1;
          if (!hasAnyRecord) return 2;
          return 3;
        };
        const aPriority = getStatusPriority(a);
        const bPriority = getStatusPriority(b);
        if (aPriority === bPriority) return a.domain.localeCompare(b.domain);
        return aPriority - bPriority;
      }
    });
    return processed;
  }, [allDomains, searchTerm, filter, sortBy]);

  const paginatedDomains = useMemo(() => {
    if (perPage === -1) return processedDomains;
    const startIndex = (currentPage - 1) * perPage;
    return processedDomains.slice(startIndex, startIndex + perPage);
  }, [processedDomains, currentPage, perPage]);

  const totalPages = useMemo(() => {
    if (perPage === -1) return 1;
    return Math.ceil(processedDomains.length / perPage);
  }, [processedDomains.length, perPage]);

  const formatLastUpdate = (date: Date) => {
    return date.toLocaleString('es-ES', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-3">
              <Globe className="h-5 w-5" />
              ROLLPIX Cloudflare Manager
              <span className="text-sm font-normal text-muted-foreground">
                ({processedDomains.length} de {totalCount} dominios)
              </span>
            </CardTitle>
            <div className="flex flex-col items-end gap-1">
              <Button variant="outline" size="sm" onClick={() => fetchFromCloudflare()} disabled={loading || isBackgroundRefreshing}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading || isBackgroundRefreshing ? 'animate-spin' : ''}`} />
                {loading && loadingProgress ? `Actualizando ${loadingProgress.completed} de ${loadingProgress.total}...` : (loading ? 'Actualizando...' : 'Actualizar Todo')}
              </Button>
              <div className="flex items-center gap-2 h-4">
                {isBackgroundRefreshing && <Loader2 className="h-3 w-3 animate-spin" />}
                {lastUpdate && (
                  <span className="text-xs text-muted-foreground">
                    Últ. actualización: {formatLastUpdate(lastUpdate)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar dominios..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm"><ArrowUpDown className="h-4 w-4 mr-2" />Ordenar<ChevronDown className="h-4 w-4 ml-2" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setSortBy('name')}>Por Nombre</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortBy('status')}>Por Estado</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Select value={filter} onValueChange={(value) => setFilter(value as FilterType)}>
                <SelectTrigger className="w-40"><Filter className="h-4 w-4 mr-2" /><SelectValue placeholder="Filtrar por" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="proxied">Con Proxy</SelectItem>
                  <SelectItem value="not-proxied">Sin Proxy</SelectItem>
                </SelectContent>
              </Select>
              <Select value={perPage === -1 ? 'all' : perPage.toString()} onValueChange={(value) => setPerPage(value === 'all' ? -1 : parseInt(value))}>
                <SelectTrigger className="w-32">
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

          <RulesActionBar
            selectedDomains={allDomains.filter(d => selectedDomains.has(d.domain)).map(d => d.zoneId)}
            onClearSelection={clearDomainSelection}
            onRefresh={() => fetchFromCloudflare()}
          />

          {loading && allDomains.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Cargando dominios...
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedDomains.size === paginatedDomains.length && paginatedDomains.length > 0}
                      onCheckedChange={() => selectAllDomains(paginatedDomains)}
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
                  <TableRow key={domain.zoneId}>
                    <TableCell>
                      <Checkbox
                        checked={selectedDomains.has(domain.domain)}
                        onCheckedChange={() => toggleDomainSelection(domain.domain)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{domain.domain}</TableCell>
                    <TableCell><DNSPills domain={domain} /></TableCell>
                    <TableCell><FirewallControls domain={domain} /></TableCell>
                    <TableCell><SecurityRulesIndicator domain={domain} compact /></TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => useDomainStore.getState().refreshSingleDomain(domain.zoneId)}
                        disabled={refreshingDomainId === domain.zoneId}
                      >
                        <RefreshCw className={`h-4 w-4 ${refreshingDomainId === domain.zoneId ? 'animate-spin' : ''}`} />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {totalPages > 1 && perPage !== -1 && (
            <div className="mt-4 flex justify-center">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious onClick={() => currentPage > 1 && setCurrentPage(currentPage - 1)} className={currentPage <= 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'} />
                  </PaginationItem>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let pageNumber;
                    if (totalPages <= 5) pageNumber = i + 1;
                    else if (currentPage <= 3) pageNumber = i + 1;
                    else if (currentPage >= totalPages - 2) pageNumber = totalPages - 4 + i;
                    else pageNumber = currentPage - 2 + i;
                    return (
                      <PaginationItem key={pageNumber}>
                        <PaginationLink onClick={() => setCurrentPage(pageNumber)} isActive={currentPage === pageNumber} className="cursor-pointer">{pageNumber}</PaginationLink>
                      </PaginationItem>
                    );
                  })}
                  <PaginationItem>
                    <PaginationNext onClick={() => currentPage < totalPages && setCurrentPage(currentPage + 1)} className={currentPage >= totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'} />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
