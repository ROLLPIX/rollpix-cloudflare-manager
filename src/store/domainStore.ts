import { create } from 'zustand';
import { DomainStatus } from '@/types/cloudflare';
import { tokenStorage } from '@/lib/tokenStorage';
import { toast } from 'sonner';

export type FilterType = 'all' | 'proxied' | 'not-proxied';
export type SortType = 'name' | 'status';

interface Preferences {
  perPage: number;
  sortBy: SortType;
  filter: FilterType;
  searchTerm: string;
}

interface DomainState {
  allDomains: DomainStatus[];
  loading: boolean;
  loadingProgress: { completed: number; total: number } | null;
  isBackgroundRefreshing: boolean;
  selectedDomains: Set<string>;
  updatingRecords: Set<string>;
  currentPage: number;
  perPage: number;
  searchTerm: string;
  filter: FilterType;
  sortBy: SortType;
  totalCount: number;
  lastUpdate: Date | null;
  refreshingDomainId: string | null;
}

interface DomainActions {
  initializeDomains: () => Promise<void>;
  fetchFromCloudflare: (isBackground?: boolean) => Promise<void>;
  refreshSingleDomain: (zoneId: string) => Promise<void>;
  toggleProxy: (zoneId: string, recordId: string, currentProxied: boolean) => Promise<void>;
  setSearchTerm: (term: string) => void;
  setFilter: (filter: FilterType) => void;
  setSortBy: (sort: SortType) => void;
  setCurrentPage: (page: number) => void;
  setPerPage: (perPage: number) => void;
  toggleDomainSelection: (domain: string) => void;
  selectAllDomains: (paginatedDomains: DomainStatus[]) => void;
  clearDomainSelection: () => void;
  savePreferences: (prefs: Partial<Preferences>) => void;
}

export const useDomainStore = create<DomainState & DomainActions>((set, get) => ({
  allDomains: [],
  loading: false,
  loadingProgress: null,
  isBackgroundRefreshing: false,
  selectedDomains: new Set(),
  updatingRecords: new Set(),
  currentPage: 1,
  perPage: 50, // Default per page
  searchTerm: '',
  filter: 'all',
  sortBy: 'name',
  totalCount: 0,
  lastUpdate: null,
  refreshingDomainId: null,

  setSearchTerm: (term) => {
    set({ searchTerm: term, currentPage: 1 });
    get().savePreferences({ searchTerm: term });
  },
  setFilter: (filter) => {
    set({ filter, currentPage: 1 });
    get().savePreferences({ filter });
  },
  setSortBy: (sort) => {
    set({ sortBy: sort, currentPage: 1 });
    get().savePreferences({ sortBy: sort });
  },
  setCurrentPage: (page) => set({ currentPage: page }),
  setPerPage: (perPage) => {
    set({ perPage, currentPage: 1 });
    get().savePreferences({ perPage });
  },

  savePreferences: async (prefs: Partial<Preferences>) => {
    try {
      const currentPrefs = {
        perPage: get().perPage,
        sortBy: get().sortBy,
        filter: get().filter,
        searchTerm: get().searchTerm,
      };
      await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...currentPrefs, ...prefs }),
      });
    } catch (error) {
      console.error('Error saving preferences:', error);
    }
  },

  toggleDomainSelection: (domain) => set(state => {
    const newSet = new Set(state.selectedDomains);
    if (newSet.has(domain)) newSet.delete(domain);
    else newSet.add(domain);
    return { selectedDomains: newSet };
  }),

  selectAllDomains: (paginatedDomains) => set(state => {
    if (state.selectedDomains.size === paginatedDomains.length) {
      return { selectedDomains: new Set() };
    } else {
      return { selectedDomains: new Set(paginatedDomains.map(d => d.domain)) };
    }
  }),

  clearDomainSelection: () => set({ selectedDomains: new Set() }),

  fetchFromCloudflare: async (isBackground = false) => {
    if (!isBackground) {
      set({ loading: true, loadingProgress: { completed: 0, total: 1 } });
    } else {
      set({ isBackgroundRefreshing: true });
    }
    const apiToken = tokenStorage.getToken();
    console.log('[DomainStore] Token being used:', apiToken ? `${apiToken.substring(0, 8)}...` : 'null');
    if (!apiToken) {
      toast.error('API Token no encontrado.');
      set({ loading: false, isBackgroundRefreshing: false });
      return;
    }

    try {
      const domainsResponse = await fetch(`/api/domains`, { 
        headers: { 'x-api-token': apiToken },
      });
      if (!domainsResponse.ok) throw new Error('Error al obtener dominios');
      const domainData = await domainsResponse.json();

      if (!isBackground) {
        set({ loadingProgress: { completed: domainData.totalCount / 2, total: domainData.totalCount } });

        // Use specific zone IDs from the domains we just fetched (only accessible zones)
        const accessibleZoneIds = domainData.domains.map((domain: any) => domain.zoneId);
        console.log('[DomainStore] Calling /api/security-rules/analyze for accessible zones only...', accessibleZoneIds.length);

        const analyzeResponse = await fetch('/api/security-rules/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiToken,
            zoneIds: accessibleZoneIds,  // ✅ Only analyze zones we have access to
            forceRefresh: true
          })
        });
        console.log('[DomainStore] Analyze response status:', analyzeResponse.status);
        if (!analyzeResponse.ok) {
          console.error('[DomainStore] Analyze failed:', analyzeResponse.status, analyzeResponse.statusText);
          throw new Error('Error al analizar reglas');
        }

        console.log('[DomainStore] Calling /api/domains/enrich...');
        const enrichResponse = await fetch('/api/domains/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        console.log('[DomainStore] Enrich response status:', enrichResponse.status);
        if (!enrichResponse.ok) {
          console.error('[DomainStore] Enrich failed:', enrichResponse.status, enrichResponse.statusText);
          throw new Error('Error al enriquecer dominios');
        }
        const enrichResult = await enrichResponse.json();
        
        set({
          allDomains: enrichResult.success ? enrichResult.data.domains : domainData.domains,
          totalCount: domainData.totalCount,
          lastUpdate: new Date(),
          loadingProgress: { completed: domainData.totalCount, total: domainData.totalCount }
        });
        toast.success(`${domainData.totalCount} dominios y reglas actualizados.`);
      } else {
        set({
          allDomains: domainData.domains,
          totalCount: domainData.totalCount,
          lastUpdate: new Date()
        });
        toast.success(`${domainData.totalCount} dominios actualizados en segundo plano.`);
      }
    } catch (error) {
      console.error('Error fetching from Cloudflare:', error);
      toast.error('Error al actualizar datos desde Cloudflare.');
    } finally {
      set({ loading: false, isBackgroundRefreshing: false, loadingProgress: null });
    }
  },

  initializeDomains: async () => {
    console.log('[DomainStore] Starting initializeDomains...');
    const startTime = Date.now();

    try {
      // Load preferences and cache in parallel for better performance
      const [preferencesResponse, cacheResponse] = await Promise.allSettled([
        fetch('/api/preferences'),
        fetch('/api/cache')
      ]);

      // Handle preferences
      if (preferencesResponse.status === 'fulfilled' && preferencesResponse.value.ok) {
        try {
          const prefs = await preferencesResponse.value.json();
          set({
            perPage: prefs.perPage || 50,
            sortBy: prefs.sortBy || 'name',
            filter: prefs.filter || 'all',
            searchTerm: prefs.searchTerm || ''
          });
          console.log('[DomainStore] Preferences loaded:', prefs);
        } catch (e) {
          console.error("Failed to parse preferences:", e);
        }
      }

      // Handle cache
      if (cacheResponse.status === 'fulfilled' && cacheResponse.value.ok) {
        try {
          const cacheData = await cacheResponse.value.json();
          if (cacheData.domains && cacheData.domains.length > 0) {
            const loadTime = Date.now() - startTime;
            console.log(`[DomainStore] Cache loaded in ${loadTime}ms with ${cacheData.domains.length} domains`);

            set({
              allDomains: cacheData.domains,
              totalCount: cacheData.totalCount,
              lastUpdate: new Date(cacheData.lastUpdate)
            });

            toast.success('Dominios cargados desde caché, actualizando en segundo plano...');

            // Start background refresh after a short delay to allow UI to render
            setTimeout(() => {
              get().fetchFromCloudflare(true);
            }, 100);
            return;
          }
        } catch (e) {
          console.error("Failed to parse cache:", e);
        }
      }

      console.log('[DomainStore] No cache available, fetching from Cloudflare...');
      await get().fetchFromCloudflare();

    } catch (error) {
      console.error('[DomainStore] Error in initializeDomains:', error);
      await get().fetchFromCloudflare();
    }
  },

  toggleProxy: async (zoneId, recordId, currentProxied) => {
    const recordKey = `${zoneId}-${recordId}`;
    set(state => ({ updatingRecords: new Set(state.updatingRecords.add(recordKey)) }));
    
    const apiToken = tokenStorage.getToken();
    if (!apiToken) {
      toast.error('API Token no encontrado.');
      set(state => {
        const newSet = new Set(state.updatingRecords);
        newSet.delete(recordKey);
        return { updatingRecords: newSet };
      });
      return;
    }

    try {
      const response = await fetch('/api/proxy-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-token': apiToken },
        body: JSON.stringify({ zoneId, recordId, proxied: !currentProxied }),
      });

      if (!response.ok) throw new Error('Error al cambiar el estado del proxy');
      
      await get().refreshSingleDomain(zoneId);
      toast.success(`Proxy ${!currentProxied ? 'habilitado' : 'deshabilitado'} correctamente`);
    } catch (error) {
      console.error('Error toggling proxy:', error);
      toast.error('Error al cambiar el estado del proxy');
    } finally {
      set(state => {
        const newSet = new Set(state.updatingRecords);
        newSet.delete(recordKey);
        return { updatingRecords: newSet };
      });
    }
  },

  refreshSingleDomain: async (zoneId: string) => {
    console.log(`[DomainStore] Starting refresh for domain ${zoneId}`);
    set({ refreshingDomainId: zoneId });
    const apiToken = tokenStorage.getToken();
    console.log('[DomainStore] RefreshSingle - Token being used:', apiToken ? `${apiToken.substring(0, 8)}...` : 'null');
    if (!apiToken) {
      toast.error('API Token no encontrado.');
      set({ refreshingDomainId: null });
      return;
    }

    try {
      console.log(`[DomainStore] Refreshing domain ${zoneId} - trying optimized approach`);

      // Try optimized approach: refresh rules first, then get fresh data from cache
      let rulesUpdated = false;

      try {
        console.log(`[DomainStore] Analyzing security rules for ${zoneId}`);
        const analyzeResponse = await fetch('/api/security-rules/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiToken,
            zoneIds: [zoneId],
            forceRefresh: true
          })
        });

        if (analyzeResponse.ok) {
          console.log(`[DomainStore] Security rules analysis completed`);
          rulesUpdated = true;
        } else {
          console.warn(`[DomainStore] Security rules analysis failed: ${analyzeResponse.status}`);
        }
      } catch (error) {
        console.warn(`[DomainStore] Security rules analysis error:`, error);
      }

      // Get fresh domain data
      try {
        console.log(`[DomainStore] Fetching domain data for ${zoneId}`);
        const domainResponse = await fetch(`/api/domains?zoneId=${zoneId}`, {
          headers: { 'x-api-token': apiToken }
        });

        if (domainResponse.ok) {
          const domainData = await domainResponse.json();
          const updatedDomain = domainData.domains?.[0];

          if (updatedDomain) {
            console.log(`[DomainStore] Fresh domain data obtained`);

            // Try to enrich if rules were updated
            let finalDomain = updatedDomain;
            if (rulesUpdated) {
              try {
                console.log(`[DomainStore] Enriching domain with security data`);
                const enrichResponse = await fetch('/api/domains/enrich', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' }
                });

                if (enrichResponse.ok) {
                  const enrichResult = await enrichResponse.json();
                  if (enrichResult.success) {
                    const enrichedDomain = enrichResult.data.domains.find((d: any) => d.zoneId === zoneId);
                    if (enrichedDomain) {
                      finalDomain = enrichedDomain;
                      console.log(`[DomainStore] Domain enriched with security data`);
                    }
                  }
                }
              } catch (error) {
                console.warn(`[DomainStore] Enrichment failed, using basic domain data:`, error);
              }
            }

            // Update state
            set(state => ({
              allDomains: state.allDomains.map(d => d.zoneId === zoneId ? finalDomain : d),
              lastUpdate: new Date()
            }));

            toast.success(`Dominio ${finalDomain.domain} actualizado correctamente.`);
            return;
          }
        }
      } catch (error) {
        console.warn(`[DomainStore] Domain fetch failed:`, error);
      }

      // Fallback: use cache data but inform user
      console.log(`[DomainStore] Falling back to cache data`);
      const cacheResponse = await fetch('/api/cache');
      if (cacheResponse.ok) {
        const cacheData = await cacheResponse.json();
        const cachedDomain = cacheData.domains?.find((d: any) => d.zoneId === zoneId);

        if (cachedDomain) {
          set(state => ({
            allDomains: state.allDomains.map(d => d.zoneId === zoneId ? cachedDomain : d)
          }));
          toast.info(`Dominio ${cachedDomain.domain} actualizado desde cache (sin datos frescos de Cloudflare).`);
          return;
        }
      }

      throw new Error('No se pudo obtener datos del dominio ni desde Cloudflare ni desde cache');

    } catch (error) {
      console.error(`[DomainStore] Error refreshing domain ${zoneId}:`, error);
      toast.error(`Error al actualizar dominio: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    } finally {
      set({ refreshingDomainId: null });
    }
  },
}));
