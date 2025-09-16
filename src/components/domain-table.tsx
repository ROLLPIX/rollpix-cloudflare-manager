'use client';

import { useEffect, useMemo } from 'react';
import { DomainStatus } from '@/types/cloudflare';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { RefreshCw, Loader2, Search, Globe } from 'lucide-react';
import { SecurityRulesIndicator } from './SecurityRulesIndicator';
import { RulesActionBar } from './RulesActionBar';
import { DNSPills } from './DNSPills';
import { FirewallControls } from './FirewallControls';
import { ProgressPopup } from './ProgressPopup';
import { useDomainStore } from '@/store/domainStore';
import { FilterPills } from './FilterPills';

export function DomainTable() {
  const {
    allDomains,
    loading,
    loadingProgress,
    unifiedProgress,
    isBackgroundRefreshing,
    selectedDomains,
    currentPage,
    perPage,
    searchTerm,
    filterPills,
    totalCount,
    lastUpdate,
    refreshingDomainId,
    initializeDomains,
    fetchFromCloudflareUnified,
    refreshMultipleDomains,
    setSearchTerm,
    setCurrentPage,
    setPerPage,
    toggleDomainSelection,
    selectAllDomains,
    clearDomainSelection,
    toggleUnderAttackMode,
    toggleBotFightMode,
    updatingFirewall,
    toggleProxy,
    updatingRecords,
    bulkToggleProxy,
  } = useDomainStore();

  useEffect(() => {
    console.log('[DomainTable] useEffect running, initializeDomains type:', typeof initializeDomains);
    if (typeof initializeDomains === 'function') {
      console.log('[DomainTable] calling initializeDomains...');
      initializeDomains();
    } else {
      console.error('[DomainTable] initializeDomains is not a function!', initializeDomains);
    }
  }, []); // Solo ejecutar una vez al montar el componente

  const processedDomains = useMemo(() => {
    let processed = [...allDomains];

    // Apply search filter
    if (searchTerm) {
      processed = processed.filter(domain =>
        domain.domain.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply pill filters
    if (filterPills.underAttack !== null) {
      processed = processed.filter(domain =>
        (domain.underAttackMode || false) === filterPills.underAttack
      );
    }

    if (filterPills.botFight !== null) {
      processed = processed.filter(domain =>
        (domain.botFightMode || false) === filterPills.botFight
      );
    }

    if (filterPills.hasRules !== null) {
      processed = processed.filter(domain => {
        const hasRules = (domain.securityRules?.totalRules || 0) > 0;
        return hasRules === filterPills.hasRules;
      });
    }

    if (filterPills.proxy !== null) {
      processed = processed.filter(domain => {
        const hasRootRecord = !!domain.rootRecord;
        const hasWwwRecord = !!domain.wwwRecord;
        const rootProxied = domain.rootProxied || false;
        const wwwProxied = domain.wwwProxied || false;

        if (filterPills.proxy === true) {
          // Verde: TODOS los registros activos están proxied
          if (hasRootRecord && hasWwwRecord) {
            return rootProxied && wwwProxied;
          } else if (hasRootRecord) {
            return rootProxied;
          } else if (hasWwwRecord) {
            return wwwProxied;
          }
          return false; // No tiene registros
        } else {
          // Rojo: AL MENOS UNO no está proxied
          if (hasRootRecord && hasWwwRecord) {
            return !rootProxied || !wwwProxied;
          } else if (hasRootRecord) {
            return !rootProxied;
          } else if (hasWwwRecord) {
            return !wwwProxied;
          }
          return true; // No tiene registros = considerado "no proxied"
        }
      });
    }

    // Simple alphabetical sort by domain name
    processed.sort((a, b) => a.domain.localeCompare(b.domain));

    return processed;
  }, [allDomains, searchTerm, filterPills]);

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
              Mis dominios
              <span className="text-sm font-normal text-muted-foreground">
                ({processedDomains.length} de {totalCount} dominios)
              </span>
            </CardTitle>
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={() => fetchFromCloudflareUnified(false, true)} disabled={loading || isBackgroundRefreshing}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${loading || isBackgroundRefreshing ? 'animate-spin' : ''}`} />
                  {loading ? 'Actualizando...' : 'Actualizar Todo'}
                </Button>
              </div>
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
          <div className="flex flex-col gap-4 mb-6">
            <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center">
              <div className="lg:w-80">
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
              <div className="flex-1 flex flex-wrap items-center gap-4">
                <FilterPills />
              </div>
              <div className="flex-shrink-0">
                <Select value={perPage === -1 ? 'all' : perPage.toString()} onValueChange={(value) => setPerPage(value === 'all' ? -1 : parseInt(value))}>
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

          <RulesActionBar
            selectedDomains={allDomains.filter(d => selectedDomains.has(d.domain)).map(d => d.zoneId)}
            onClearSelection={clearDomainSelection}
            onRefreshSelectedDomains={refreshMultipleDomains}
            onBulkProxy={bulkToggleProxy}
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
                    <TableCell>
                      <DNSPills
                        domain={domain}
                        onToggleProxy={toggleProxy}
                        updatingRecords={updatingRecords}
                      />
                    </TableCell>
                    <TableCell>
                      <FirewallControls
                        domain={domain}
                        onToggleUnderAttack={toggleUnderAttackMode}
                        onToggleBotFight={toggleBotFightMode}
                        updatingUnderAttack={updatingFirewall.has(`${domain.zoneId}-under_attack`)}
                        updatingBotFight={updatingFirewall.has(`${domain.zoneId}-bot_fight`)}
                      />
                    </TableCell>
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

      <ProgressPopup
        isVisible={!!unifiedProgress}
        percentage={unifiedProgress?.percentage || 0}
      />
    </>
  );
}
