'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { DomainStatus } from '@/types/cloudflare';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { RefreshCw, Shield, ShieldOff, Loader2, Search, Filter, ArrowUpDown, ChevronDown, Globe } from 'lucide-react';
import { toast } from 'sonner';
import Image from 'next/image';
import { SecurityRulesIndicator } from './SecurityRulesIndicator';
import { RulesActionBar } from './RulesActionBar';

interface DomainTableProps {
  apiToken: string;
}

type FilterType = 'all' | 'proxied' | 'not-proxied';
type SortType = 'name' | 'status';

export function DomainTable({ apiToken }: DomainTableProps) {
  const [allDomains, setAllDomains] = useState<DomainStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDomains, setSelectedDomains] = useState<Set<string>>(new Set());
  const [updatingRecords, setUpdatingRecords] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(24);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [sortBy, setSortBy] = useState<SortType>('name');
  
  // Update options state
  const [updateOptions, setUpdateOptions] = useState({
    dns: true,
    firewall: false,
    reglas: true
  });
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{
    current: number;
    total: number;
    currentDomain: string;
    isActive: boolean;
  }>({ current: 0, total: 0, currentDomain: '', isActive: false });
  const [analyzingSecurityRules, setAnalyzingSecurityRules] = useState(false);

  // Sort, filter and search domains
  const processedDomains = useMemo(() => {
    let processed = [...allDomains];

    // Apply search filter
    if (searchTerm) {
      processed = processed.filter(domain =>
        domain.domain.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply proxy status filter
    if (filter !== 'all') {
      processed = processed.filter(domain => {
        const hasProxiedRecord = domain.rootProxied || domain.wwwProxied;
        return filter === 'proxied' ? hasProxiedRecord : !hasProxiedRecord;
      });
    }

    // Apply sorting
    processed.sort((a, b) => {
      if (sortBy === 'name') {
        return a.domain.localeCompare(b.domain);
      } else {
        // Sort by status priority:
        // 1. Domains with records but no proxy (highest priority - red)
        // 2. Domains without records (medium priority - gray)
        // 3. Domains with proxy (lowest priority - green)
        
        const getStatusPriority = (domain: DomainStatus) => {
          const hasRootRecord = !!domain.rootRecord;
          const hasWwwRecord = !!domain.wwwRecord;
          const hasAnyRecord = hasRootRecord || hasWwwRecord;
          const hasAnyProxy = domain.rootProxied || domain.wwwProxied;
          
          if (hasAnyRecord && !hasAnyProxy) {
            return 1; // Highest priority: has records but no proxy
          } else if (!hasAnyRecord) {
            return 2; // Medium priority: no records at all
          } else {
            return 3; // Lowest priority: has proxy
          }
        };
        
        const aPriority = getStatusPriority(a);
        const bPriority = getStatusPriority(b);
        
        if (aPriority === bPriority) {
          return a.domain.localeCompare(b.domain);
        }
        return aPriority - bPriority; // lower number = higher priority
      }
    });

    return processed;
  }, [allDomains, searchTerm, filter, sortBy]);

  // Paginate processed domains
  const paginatedDomains = useMemo(() => {
    if (perPage === -1) return processedDomains; // Show all
    
    const startIndex = (currentPage - 1) * perPage;
    return processedDomains.slice(startIndex, startIndex + perPage);
  }, [processedDomains, currentPage, perPage]);

  const totalPages = useMemo(() => {
    if (perPage === -1) return 1;
    return Math.ceil(processedDomains.length / perPage);
  }, [processedDomains.length, perPage]);

  const loadFromCache = useCallback(async () => {
    try {
      const response = await fetch('/api/cache');
      if (response.ok) {
        const cacheData = await response.json();
        if (cacheData.domains && cacheData.domains.length > 0) {
          setAllDomains(cacheData.domains);
          setTotalCount(cacheData.totalCount);
          if (cacheData.lastUpdate) {
            setLastUpdate(new Date(cacheData.lastUpdate));
          }
          return true; // Cache loaded successfully
        }
      }
    } catch (error) {
      console.error('Error loading cache:', error);
    }
    return false; // Cache not available or empty
  }, []);

  const fetchFromCloudflareAndCache = useCallback(async () => {
    setLoading(true);
    try {
      let allFetchedDomains: DomainStatus[] = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await fetch(`/api/domains?page=${page}&per_page=50`, {
          headers: {
            'x-api-token': apiToken,
          },
        });
        
        if (!response.ok) {
          throw new Error(`Error al obtener dominios: ${response.status}`);
        }
        
        const data = await response.json();
        allFetchedDomains = [...allFetchedDomains, ...data.domains];
        
        hasMore = page < data.totalPages;
        page++;

        // Small delay to avoid rate limiting
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Update state
      setAllDomains(allFetchedDomains);
      setTotalCount(allFetchedDomains.length);
      setLastUpdate(new Date());

      // Save to cache
      try {
        await fetch('/api/cache', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ domains: allFetchedDomains }),
        });
      } catch (cacheError) {
        console.error('Error saving to cache:', cacheError);
      }

      toast.success(`${allFetchedDomains.length} dominios actualizados desde Cloudflare`);
    } catch (error) {
      console.error('Error fetching domains:', error);
      toast.error('Error al cargar dominios. Verifica tu API token.');
    } finally {
      setLoading(false);
    }
  }, [apiToken]);

  const loadPreferences = useCallback(async () => {
    try {
      const response = await fetch('/api/preferences');
      if (response.ok) {
        const preferences = await response.json();
        setPerPage(preferences.perPage);
        setSortBy(preferences.sortBy);
        setFilter(preferences.filter);
        setSearchTerm(preferences.searchTerm || '');
        setPreferencesLoaded(true);
        return true;
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
    }
    setPreferencesLoaded(true);
    return false;
  }, []);

  const savePreferences = useCallback(async (newPreferences: Partial<{
    perPage: number;
    sortBy: SortType;
    filter: FilterType;
    searchTerm: string;
  }>) => {
    try {
      await fetch('/api/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newPreferences),
      });
    } catch (error) {
      console.error('Error saving preferences:', error);
    }
  }, []);

  const initializeDomains = useCallback(async () => {
    const cacheLoaded = await loadFromCache();
    if (cacheLoaded) {
      toast.success('Dominios cargados desde caché local');
    } else {
      // No cache available, fetch from Cloudflare
      await fetchFromCloudflareAndCache();
    }
  }, [loadFromCache, fetchFromCloudflareAndCache]);

  const refreshSpecificDomain = useCallback(async (zoneId: string) => {
    try {
      // Get the zone name from current domains
      const domain = allDomains.find(d => d.zoneId === zoneId);
      if (!domain) return;

      // Fetch updated DNS records for this specific zone
      const response = await fetch(`/api/domains?page=1&per_page=50`, {
        headers: {
          'x-api-token': apiToken,
        },
      });

      if (!response.ok) {
        throw new Error('Error al refrescar dominio');
      }

      const data = await response.json();
      const updatedDomain = data.domains.find((d: DomainStatus) => d.zoneId === zoneId);

      if (updatedDomain) {
        // Update only this domain in the state and cache
        const updatedDomains = allDomains.map(d => 
          d.zoneId === zoneId ? updatedDomain : d
        );

        setAllDomains(updatedDomains);

        // Update cache
        try {
          await fetch('/api/cache', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ domains: updatedDomains }),
          });
        } catch (cacheError) {
          console.error('Error updating cache:', cacheError);
        }
      }
    } catch (error) {
      console.error('Error refreshing specific domain:', error);
    }
  }, [allDomains, apiToken]);

  const refreshMultipleDomains = useCallback(async (zoneIds: string[]) => {
    try {
      // Get updated data for all specified zones
      const response = await fetch(`/api/domains?page=1&per_page=50`, {
        headers: {
          'x-api-token': apiToken,
        },
      });

      if (!response.ok) {
        throw new Error('Error al refrescar dominios');
      }

      const data = await response.json();
      let updatedDomains = [...allDomains];

      // Update each specified domain
      zoneIds.forEach(zoneId => {
        const updatedDomain = data.domains.find((d: DomainStatus) => d.zoneId === zoneId);
        if (updatedDomain) {
          updatedDomains = updatedDomains.map(d => 
            d.zoneId === zoneId ? updatedDomain : d
          );
        }
      });

      setAllDomains(updatedDomains);

      // Update cache
      try {
        await fetch('/api/cache', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ domains: updatedDomains }),
        });
      } catch (cacheError) {
        console.error('Error updating cache:', cacheError);
      }
    } catch (error) {
      console.error('Error refreshing multiple domains:', error);
    }
  }, [allDomains, apiToken]);

  const toggleProxy = async (zoneId: string, recordId: string, currentProxied: boolean) => {
    const recordKey = `${zoneId}-${recordId}`;
    setUpdatingRecords(prev => new Set(prev.add(recordKey)));
    
    try {
      const response = await fetch('/api/proxy-toggle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-token': apiToken,
        },
        body: JSON.stringify({
          zoneId,
          recordId,
          proxied: !currentProxied,
        }),
      });

      if (!response.ok) {
        throw new Error('Error al cambiar el estado del proxy');
      }

      // Refresh the specific domain from Cloudflare to get accurate data
      await refreshSpecificDomain(zoneId);

      toast.success(`Proxy ${!currentProxied ? 'habilitado' : 'deshabilitado'} correctamente`);
    } catch (error) {
      console.error('Error toggling proxy:', error);
      toast.error('Error al cambiar el estado del proxy');
    } finally {
      setUpdatingRecords(prev => {
        const newSet = new Set(prev);
        newSet.delete(recordKey);
        return newSet;
      });
    }
  };

  const toggleDomainSelection = (domain: string) => {
    setSelectedDomains(prev => {
      const newSet = new Set(prev);
      if (newSet.has(domain)) {
        newSet.delete(domain);
      } else {
        newSet.add(domain);
      }
      return newSet;
    });
  };

  const selectAllDomains = () => {
    if (selectedDomains.size === paginatedDomains.length) {
      setSelectedDomains(new Set());
    } else {
      setSelectedDomains(new Set(paginatedDomains.map(d => d.domain)));
    }
  };

  const clearDomainSelection = () => {
    setSelectedDomains(new Set());
  };

  const getSelectedZoneIds = () => {
    return allDomains
      .filter(domain => selectedDomains.has(domain.domain))
      .map(domain => domain.zoneId);
  };

  const bulkToggleProxy = async (enable: boolean) => {
    const selectedDomainData = allDomains.filter(d => selectedDomains.has(d.domain));
    const operations: Array<{ domain: string; zoneId: string; recordId: string; currentProxied: boolean }> = [];
    const affectedZoneIds = new Set<string>();

    // Collect all operations and track affected zones
    selectedDomainData.forEach(domain => {
      affectedZoneIds.add(domain.zoneId);
      if (domain.rootRecord && domain.rootRecord.proxiable) {
        operations.push({
          domain: domain.domain,
          zoneId: domain.zoneId,
          recordId: domain.rootRecord.id,
          currentProxied: domain.rootProxied
        });
      }
      if (domain.wwwRecord && domain.wwwRecord.proxiable) {
        operations.push({
          domain: domain.domain,
          zoneId: domain.zoneId,
          recordId: domain.wwwRecord.id,
          currentProxied: domain.wwwProxied
        });
      }
    });

    if (operations.length === 0) return;

    // Count domains, not individual records
    setBulkProgress({ current: 0, total: selectedDomainData.length, currentDomain: '', isActive: true });

    try {
      let currentDomainIndex = 0;
      let currentDomain = '';

      for (let i = 0; i < operations.length; i++) {
        const op = operations[i];
        
        // Update progress only when we move to a new domain
        if (op.domain !== currentDomain) {
          currentDomain = op.domain;
          currentDomainIndex++;
          setBulkProgress(prev => ({ ...prev, current: currentDomainIndex, currentDomain: op.domain }));
        }
        
        // Only toggle if the current state doesn't match desired state
        if (op.currentProxied !== enable) {
          // Call the API to toggle proxy (without refreshing individual domain)
          const response = await fetch('/api/proxy-toggle', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-token': apiToken,
            },
            body: JSON.stringify({
              zoneId: op.zoneId,
              recordId: op.recordId,
              proxied: enable,
            }),
          });

          if (!response.ok) {
            console.error(`Error toggling proxy for ${op.domain}`);
          }
        }
        
        // Delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      // Refresh all affected domains at once
      if (affectedZoneIds.size > 0) {
        await refreshMultipleDomains(Array.from(affectedZoneIds));
      }

      toast.success(`Operación completada: ${selectedDomainData.length} dominios actualizados`);
      setSelectedDomains(new Set());
    } catch (error) {
      toast.error('Error en la operación masiva');
    } finally {
      setBulkProgress(prev => ({ ...prev, isActive: false }));
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handlePerPageChange = (value: string) => {
    const newPerPage = value === 'all' ? -1 : parseInt(value);
    setPerPage(newPerPage);
    setCurrentPage(1);
    if (preferencesLoaded) {
      savePreferences({ perPage: newPerPage });
    }
  };

  const handleRefresh = () => {
    fetchFromCloudflareAndCache();
  };

  const handleUnifiedUpdate = async () => {
    const enabledTasks = [];
    
    if (updateOptions.dns) enabledTasks.push('DNS');
    if (updateOptions.reglas) enabledTasks.push('Reglas');
    if (updateOptions.firewall) enabledTasks.push('Firewall');
    
    if (enabledTasks.length === 0) {
      toast.error('Selecciona al menos una opción para actualizar');
      return;
    }

    // Show progress for multiple operations
    const totalTasks = enabledTasks.length;
    let completedTasks = 0;
    
    const updateProgress = (taskName: string, completed: boolean) => {
      if (completed) completedTasks++;
      setBulkProgress(prev => ({
        ...prev,
        current: completedTasks,
        total: totalTasks,
        currentDomain: `Actualizando ${taskName}...`
      }));
    };

    try {
      setBulkProgress({ current: 0, total: totalTasks, currentDomain: 'Iniciando actualización...' });
      
      if (updateOptions.dns) {
        updateProgress('DNS', false);
        await handleRefresh();
        updateProgress('DNS', true);
      }
      
      if (updateOptions.reglas) {
        updateProgress('Reglas', false);
        await analyzeSecurityRules();
        updateProgress('Reglas', true);
      }
      
      if (updateOptions.firewall) {
        updateProgress('Firewall', false);
        // TODO: Implementar funcionalidad de firewall
        toast('Funcionalidad de Firewall pendiente de implementación', { 
          description: 'Esta opción estará disponible próximamente' 
        });
        updateProgress('Firewall', true);
      }

      toast.success(`Actualización completada: ${enabledTasks.join(', ')}`);
    } catch (error) {
      toast.error('Error durante la actualización');
    } finally {
      setBulkProgress(prev => ({ ...prev, current: 0, total: 0, currentDomain: '' }));
    }
  };

  const analyzeSecurityRules = useCallback(async () => {
    try {
      setAnalyzingSecurityRules(true);
      
      // First, analyze rules
      const analyzeResponse = await fetch('/api/security-rules/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiToken, forceRefresh: true })
      });
      
      if (analyzeResponse.ok) {
        // Then enrich domains with security data
        const enrichResponse = await fetch('/api/domains/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (enrichResponse.ok) {
          const enrichResult = await enrichResponse.json();
          if (enrichResult.success) {
            setAllDomains(enrichResult.data.domains);
            toast.success('Análisis de reglas de seguridad completado');
          }
        }
      } else {
        toast.error('Error al analizar reglas de seguridad');
      }
    } catch (error) {
      console.error('Error analyzing security rules:', error);
      toast.error('Error al analizar reglas de seguridad');
    } finally {
      setAnalyzingSecurityRules(false);
    }
  }, [apiToken]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
    if (preferencesLoaded) {
      savePreferences({ searchTerm: value });
    }
  };

  const handleFilterChange = (value: FilterType) => {
    setFilter(value);
    setCurrentPage(1);
    if (preferencesLoaded) {
      savePreferences({ filter: value });
    }
  };

  const handleSortChange = (value: SortType) => {
    setSortBy(value);
    setCurrentPage(1);
    if (preferencesLoaded) {
      savePreferences({ sortBy: value });
    }
  };

  const formatLastUpdate = (date: Date) => {
    return date.toLocaleString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // Load preferences first, then domains
  useEffect(() => {
    if (apiToken && !preferencesLoaded) {
      loadPreferences();
    }
  }, [apiToken, loadPreferences, preferencesLoaded]);

  // Load domains after preferences are loaded
  useEffect(() => {
    if (apiToken && preferencesLoaded && allDomains.length === 0) {
      initializeDomains();
    }
  }, [apiToken, preferencesLoaded, initializeDomains, allDomains.length]);

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
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" disabled={loading || analyzingSecurityRules}>
                      <RefreshCw className={`h-4 w-4 mr-2 ${(loading || analyzingSecurityRules) ? 'animate-spin' : ''}`} />
                      {loading || analyzingSecurityRules ? 'Actualizando...' : 'Actualizar'}
                      <ChevronDown className="h-4 w-4 ml-2" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56" align="end">
                    <div className="space-y-3">
                      <h4 className="font-medium leading-none">Opciones de Actualización</h4>
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <Checkbox 
                            id="dns"
                            checked={updateOptions.dns}
                            onCheckedChange={(checked) => 
                              setUpdateOptions(prev => ({ ...prev, dns: checked as boolean }))
                            }
                          />
                          <label htmlFor="dns" className="text-sm">DNS</label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox 
                            id="firewall"
                            checked={updateOptions.firewall}
                            onCheckedChange={(checked) => 
                              setUpdateOptions(prev => ({ ...prev, firewall: checked as boolean }))
                            }
                          />
                          <label htmlFor="firewall" className="text-sm">Firewall</label>
                          <Badge variant="secondary" className="text-xs">Próximamente</Badge>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox 
                            id="reglas"
                            checked={updateOptions.reglas}
                            onCheckedChange={(checked) => 
                              setUpdateOptions(prev => ({ ...prev, reglas: checked as boolean }))
                            }
                          />
                          <label htmlFor="reglas" className="text-sm">Reglas</label>
                        </div>
                      </div>
                      <Button 
                        onClick={handleUnifiedUpdate} 
                        size="sm" 
                        className="w-full"
                        disabled={loading || analyzingSecurityRules}
                      >
                        Actualizar Seleccionados
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              {lastUpdate && (
                <span className="text-xs text-muted-foreground">
                  Últ. actualización: {formatLastUpdate(lastUpdate)}
                </span>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters, Search and Sort */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar dominios..."
                  value={searchTerm}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div className="flex gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <ArrowUpDown className="h-4 w-4 mr-2" />
                    Ordenar
                    <ChevronDown className="h-4 w-4 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleSortChange('name')}>
                    Por Nombre
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleSortChange('status')}>
                    Por Estado
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Select value={filter} onValueChange={handleFilterChange}>
                <SelectTrigger className="w-40">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filtrar por" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="proxied">Con Proxy</SelectItem>
                  <SelectItem value="not-proxied">Sin Proxy</SelectItem>
                </SelectContent>
              </Select>

              <Select value={perPage === -1 ? 'all' : perPage.toString()} onValueChange={handlePerPageChange}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Por página" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24">24</SelectItem>
                  <SelectItem value="48">48</SelectItem>
                  <SelectItem value="all">Todos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Bulk Actions */}
          <div className="flex gap-2 mb-4">
            <Button
              onClick={() => bulkToggleProxy(true)}
              disabled={selectedDomains.size === 0 || bulkProgress.isActive}
              size="sm"
              variant="outline"
              className={selectedDomains.size === 0 ? "opacity-50" : ""}
            >
              <Shield className="h-4 w-4 mr-2" />
              Habilitar Proxy {selectedDomains.size > 0 && `(${selectedDomains.size})`}
            </Button>
            <Button
              onClick={() => bulkToggleProxy(false)}
              disabled={selectedDomains.size === 0 || bulkProgress.isActive}
              size="sm"
              variant="outline"
              className={selectedDomains.size === 0 ? "opacity-50" : ""}
            >
              <ShieldOff className="h-4 w-4 mr-2" />
              Deshabilitar Proxy {selectedDomains.size > 0 && `(${selectedDomains.size})`}
            </Button>
          </div>

          {/* Rules Action Bar */}
          <RulesActionBar
            selectedDomains={getSelectedZoneIds()}
            onClearSelection={clearDomainSelection}
            apiToken={apiToken}
            onRefresh={async () => {
              await analyzeSecurityRules();
              handleRefresh(); // Refrescar dominios también
            }}
          />

          {loading && allDomains.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Cargando dominios...
            </div>
          ) : processedDomains.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm || filter !== 'all' ? 'No se encontraron dominios con los filtros aplicados.' : 'No se encontraron dominios.'}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedDomains.size === paginatedDomains.length && paginatedDomains.length > 0}
                      onCheckedChange={selectAllDomains}
                    />
                  </TableHead>
                  <TableHead>Dominio</TableHead>
                  <TableHead>Raíz (@)</TableHead>
                  <TableHead>WWW</TableHead>
                  <TableHead>Reglas de Seguridad</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedDomains.map((domain) => (
                  <TableRow key={domain.domain}>
                    <TableCell>
                      <Checkbox
                        checked={selectedDomains.has(domain.domain)}
                        onCheckedChange={() => toggleDomainSelection(domain.domain)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{domain.domain}</TableCell>
                    <TableCell>
                      {domain.rootRecord ? (
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => toggleProxy(domain.zoneId, domain.rootRecord!.id, domain.rootProxied)}
                            disabled={updatingRecords.has(`${domain.zoneId}-${domain.rootRecord.id}`) || !domain.rootRecord.proxiable}
                            title={domain.rootProxied ? "Deshabilitar proxy" : "Habilitar proxy"}
                            className="w-8 h-8 p-0"
                          >
                            {updatingRecords.has(`${domain.zoneId}-${domain.rootRecord.id}`) ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : domain.rootProxied ? (
                              <Shield className="h-4 w-4" />
                            ) : (
                              <ShieldOff className="h-4 w-4" />
                            )}
                          </Button>
                          <Badge
                            variant={domain.rootProxied ? "default" : "secondary"}
                            className={domain.rootProxied ? "bg-green-500" : "bg-red-500"}
                          >
                            {domain.rootProxied ? "Con Proxy" : "Solo DNS"}
                          </Badge>
                          <span className="text-xs text-muted-foreground">({domain.rootRecord.type})</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8"></div>
                          <Badge variant="outline">Sin Registro</Badge>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {domain.wwwRecord ? (
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => toggleProxy(domain.zoneId, domain.wwwRecord!.id, domain.wwwProxied)}
                            disabled={updatingRecords.has(`${domain.zoneId}-${domain.wwwRecord.id}`) || !domain.wwwRecord.proxiable}
                            title={domain.wwwProxied ? "Deshabilitar proxy" : "Habilitar proxy"}
                            className="w-8 h-8 p-0"
                          >
                            {updatingRecords.has(`${domain.zoneId}-${domain.wwwRecord.id}`) ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : domain.wwwProxied ? (
                              <Shield className="h-4 w-4" />
                            ) : (
                              <ShieldOff className="h-4 w-4" />
                            )}
                          </Button>
                          <Badge
                            variant={domain.wwwProxied ? "default" : "secondary"}
                            className={domain.wwwProxied ? "bg-green-500" : "bg-red-500"}
                          >
                            {domain.wwwProxied ? "Con Proxy" : "Solo DNS"}
                          </Badge>
                          <span className="text-xs text-muted-foreground">({domain.wwwRecord.type})</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8"></div>
                          <Badge variant="outline">Sin Registro</Badge>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <SecurityRulesIndicator domain={domain} compact apiToken={apiToken} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Pagination */}
          {totalPages > 1 && perPage !== -1 && (
            <div className="mt-4 flex justify-center">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious 
                      onClick={() => currentPage > 1 && handlePageChange(currentPage - 1)}
                      className={currentPage <= 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                  
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let pageNumber;
                    if (totalPages <= 5) {
                      pageNumber = i + 1;
                    } else if (currentPage <= 3) {
                      pageNumber = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNumber = totalPages - 4 + i;
                    } else {
                      pageNumber = currentPage - 2 + i;
                    }
                    
                    return (
                      <PaginationItem key={pageNumber}>
                        <PaginationLink
                          onClick={() => handlePageChange(pageNumber)}
                          isActive={currentPage === pageNumber}
                          className="cursor-pointer"
                        >
                          {pageNumber}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  })}
                  
                  <PaginationItem>
                    <PaginationNext 
                      onClick={() => currentPage < totalPages && handlePageChange(currentPage + 1)}
                      className={currentPage >= totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk Progress Toast */}
      {bulkProgress.isActive && (
        <div className="fixed bottom-4 right-4 bg-background border rounded-lg shadow-lg p-4 max-w-sm z-50">
          <div className="flex items-center gap-2 mb-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="font-medium">Operación en progreso</span>
          </div>
          <div className="text-sm text-muted-foreground mb-2">
            Modificando: {bulkProgress.currentDomain}
          </div>
          <div className="text-sm text-muted-foreground">
            {bulkProgress.current} de {bulkProgress.total}
          </div>
          <div className="w-full bg-muted rounded-full h-2 mt-2">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}
    </>
  );
}