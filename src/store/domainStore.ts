import { create } from 'zustand';
import { DomainStatus } from '@/types/cloudflare';
import { tokenStorage } from '@/lib/tokenStorage';
import { toast } from 'sonner';

export type FilterType = 'all' | 'proxied' | 'not-proxied';
export type SortType = 'name' | 'status';

export interface FilterPills {
  underAttack: boolean | null; // null = no filter, true = enabled, false = disabled
  botFight: boolean | null;
  hasRules: boolean | null;
  proxy: boolean | null;
}

interface Preferences {
  perPage: number;
  searchTerm: string;
  filterPills: FilterPills;
}

interface DomainState {
  allDomains: DomainStatus[];
  loading: boolean;
  loadingProgress: { completed: number; total: number } | null;
  isBackgroundRefreshing: boolean;
  selectedDomains: Set<string>;
  updatingRecords: Set<string>;
  updatingFirewall: Set<string>;
  currentPage: number;
  perPage: number;
  searchTerm: string;
  filterPills: FilterPills;
  totalCount: number;
  lastUpdate: Date | null;
  refreshingDomainId: string | null;
}

interface DomainActions {
  initializeDomains: () => Promise<void>;
  fetchFromCloudflare: (isBackground?: boolean, includeRules?: boolean) => Promise<void>;
  fetchWithRules: () => Promise<void>;
  refreshSingleDomain: (zoneId: string) => Promise<void>;
  toggleProxy: (zoneId: string, recordId: string, currentProxied: boolean) => Promise<void>;
  setSearchTerm: (term: string) => void;
  toggleFilterPill: (pillType: keyof FilterPills) => void;
  clearAllFilters: () => void;
  setCurrentPage: (page: number) => void;
  setPerPage: (perPage: number) => void;
  toggleDomainSelection: (domain: string) => void;
  selectAllDomains: (paginatedDomains: DomainStatus[]) => void;
  clearDomainSelection: () => void;
  savePreferences: (prefs: Partial<Preferences>) => void;
  toggleUnderAttackMode: (zoneId: string, enabled: boolean) => Promise<void>;
  toggleBotFightMode: (zoneId: string, enabled: boolean) => Promise<void>;
  bulkToggleProxy: (enabled: boolean) => Promise<void>;
}

export const useDomainStore = create<DomainState & DomainActions>((set, get) => ({
  allDomains: [],
  loading: false,
  loadingProgress: null,
  isBackgroundRefreshing: false,
  selectedDomains: new Set(),
  updatingRecords: new Set(),
  updatingFirewall: new Set(),
  currentPage: 1,
  perPage: 50, // Default per page
  searchTerm: '',
  filterPills: {
    underAttack: null,
    botFight: null,
    hasRules: null,
    proxy: null
  },
  totalCount: 0,
  lastUpdate: null,
  refreshingDomainId: null,

  setSearchTerm: (term) => {
    set({ searchTerm: term, currentPage: 1 });
    get().savePreferences({ searchTerm: term });
  },

  toggleFilterPill: (pillType) => {
    const { filterPills } = get();
    const currentValue = filterPills[pillType];
    let newValue: boolean | null;

    // Cycle through: null -> true -> false -> null
    if (currentValue === null) {
      newValue = true;
    } else if (currentValue === true) {
      newValue = false;
    } else {
      newValue = null;
    }

    const newFilterPills = { ...filterPills, [pillType]: newValue };
    set({ filterPills: newFilterPills, currentPage: 1 });
    get().savePreferences({ filterPills: newFilterPills });
  },

  clearAllFilters: () => {
    const clearedFilters: FilterPills = {
      underAttack: null,
      botFight: null,
      hasRules: null,
      proxy: null
    };
    set({ filterPills: clearedFilters, currentPage: 1 });
    get().savePreferences({ filterPills: clearedFilters });
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
        searchTerm: get().searchTerm,
        filterPills: get().filterPills,
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

  fetchFromCloudflare: async (isBackground = false, includeRules = false) => {
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
      console.log(`[DomainStore] Starting fetch - includeRules: ${includeRules}`);
      const domainsResponse = await fetch(`/api/domains?per_page=200`, {
        headers: { 'x-api-token': apiToken },
      });
      if (!domainsResponse.ok) throw new Error('Error al obtener dominios');
      const domainData = await domainsResponse.json();

      if (!includeRules) {
        // Fast path - preserve existing security rules data while updating basic domain data
        const { allDomains: currentDomains } = get();
        const mergedDomains = domainData.domains.map((newDomain: any) => {
          const existingDomain = currentDomains.find(d => d.zoneId === newDomain.zoneId);
          if (existingDomain?.securityRules) {
            // Preserve security rules from existing domain
            return {
              ...newDomain,
              securityRules: existingDomain.securityRules
            };
          }
          return newDomain;
        });

        set({
          allDomains: mergedDomains,
          totalCount: domainData.totalCount,
          lastUpdate: new Date()
        });

        // Save to cache
        try {
          await fetch('/api/cache', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domains: mergedDomains })
          });
          console.log('[DomainStore] Cache updated after fast fetch');
        } catch (cacheError) {
          console.warn('[DomainStore] Failed to save cache:', cacheError);
        }

        toast.success(`${domainData.totalCount} dominios actualizados rápidamente (reglas preservadas).`);
      } else {
        // Slow path - include security rules analysis
        // Update with basic domain data first
        set({
          allDomains: domainData.domains,
          totalCount: domainData.totalCount,
          lastUpdate: new Date(),
          loadingProgress: { completed: 1, total: 3 } // Step 1 of 3: domains loaded
        });

        const accessibleZoneIds = domainData.domains.map((domain: any) => domain.zoneId);
        console.log('[DomainStore] Analyzing security rules for accessible zones...', accessibleZoneIds.length);

        try {
          // Step 2: Analyze security rules
          set({ loadingProgress: { completed: 2, total: 3 } });

          const analyzeResponse = await fetch('/api/security-rules/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              apiToken,
              zoneIds: accessibleZoneIds,
              forceRefresh: !isBackground // Use cache for background refresh
            })
          });

          if (analyzeResponse.ok) {
            // Step 3: Enrich domains with rules data
            set({ loadingProgress: { completed: 3, total: 3 } });

            const enrichResponse = await fetch('/api/domains/enrich', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' }
            });

            if (enrichResponse.ok) {
              const enrichResult = await enrichResponse.json();
              set({
                allDomains: enrichResult.success ? enrichResult.data.domains : domainData.domains
              });
              toast.success(`${domainData.totalCount} dominios y reglas actualizados completamente.`);
            } else {
              // Save basic domains to cache when enrich fails
              try {
                await fetch('/api/cache', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ domains: domainData.domains })
                });
                console.log('[DomainStore] Cache updated after enrich failure');
              } catch (cacheError) {
                console.warn('[DomainStore] Failed to save cache after enrich failure:', cacheError);
              }
              toast.success(`${domainData.totalCount} dominios actualizados (reglas fallaron).`);
            }
          } else {
            // Save basic domains to cache when analyze fails
            try {
              await fetch('/api/cache', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domains: domainData.domains })
              });
              console.log('[DomainStore] Cache updated after analyze failure');
            } catch (cacheError) {
              console.warn('[DomainStore] Failed to save cache after analyze failure:', cacheError);
            }
            toast.success(`${domainData.totalCount} dominios actualizados (análisis de reglas falló).`);
          }
        } catch (rulesError) {
          console.warn('[DomainStore] Rules analysis failed:', rulesError);
          // Save basic domains to cache when rules analysis fails
          try {
            await fetch('/api/cache', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ domains: domainData.domains })
            });
            console.log('[DomainStore] Cache updated after rules analysis error');
          } catch (cacheError) {
            console.warn('[DomainStore] Failed to save cache after rules analysis error:', cacheError);
          }
          toast.success(`${domainData.totalCount} dominios actualizados (sin análisis de reglas).`);
        }
      }

    } catch (error) {
      console.error('[DomainStore] Error fetching domains:', error);
      toast.error('Error al obtener dominios desde Cloudflare');
    } finally {
      set({
        loading: false,
        isBackgroundRefreshing: false,
        loadingProgress: null
      });
    }
  },

  fetchWithRules: async () => {
    await get().fetchFromCloudflare(false, true);
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
            searchTerm: prefs.searchTerm || '',
            filterPills: prefs.filterPills || {
              underAttack: null,
              botFight: null,
              hasRules: null,
              proxy: null
            }
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
          console.log('[DomainStore] Cache response received:', cacheData);

          if (cacheData.domains && Array.isArray(cacheData.domains) && cacheData.domains.length > 0) {
            const loadTime = Date.now() - startTime;
            console.log(`[DomainStore] Cache loaded in ${loadTime}ms with ${cacheData.domains.length} domains`);

            set({
              allDomains: cacheData.domains,
              totalCount: cacheData.totalCount || cacheData.domains.length,
              lastUpdate: cacheData.lastUpdate ? new Date(cacheData.lastUpdate) : new Date()
            });

            toast.success(`${cacheData.domains.length} dominios cargados desde caché.`);
            return;
          } else {
            console.log('[DomainStore] Cache exists but no valid domains found:', cacheData);
          }
        } catch (e) {
          console.error("Failed to parse cache:", e);
        }
      } else {
        console.log('[DomainStore] Cache response failed:', {
          status: cacheResponse.status,
          ok: cacheResponse.status === 'fulfilled' ? cacheResponse.value.ok : false
        });
      }

      console.log('[DomainStore] No cache available. Auto-fetching domains from Cloudflare...');

      // Auto-fetch if no cache is available
      const apiToken = tokenStorage.getToken();
      if (apiToken) {
        console.log('[DomainStore] Token available, starting auto-fetch...');
        await get().fetchFromCloudflare(false, false); // Fast fetch without rules
      } else {
        toast.info('Introduce tu token de Cloudflare para cargar los dominios.');
      }

    } catch (error) {
      console.error('[DomainStore] Error in initializeDomains:', error);
      toast.error('Error al cargar preferencias. Usa "Actualizar Todo" para cargar dominios.');
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
    if (!apiToken) {
      toast.error('API Token no encontrado.');
      set({ refreshingDomainId: null });
      return;
    }

    try {
      console.log(`[DomainStore] Refreshing domain ${zoneId} - trying optimized approach`);

      // Get basic domain data for specific zone
      console.log(`[DomainStore] Getting basic domain data for ${zoneId}`);
      const domainResponse = await fetch(`/api/domains?zoneId=${zoneId}`, {
        headers: { 'x-api-token': apiToken },
      });

      if (domainResponse.ok) {
        const domainData = await domainResponse.json();
        const updatedDomain = domainData.domains?.find((d: any) => d.zoneId === zoneId);

        if (updatedDomain) {
          console.log(`[DomainStore] Found basic domain data, now getting security rules for ${zoneId}`);

          // Try to get security rules for this specific domain
          try {
            const rulesResponse = await fetch(`/api/domains/rules/${zoneId}`, {
              headers: { 'x-api-token': apiToken }
            });

            if (rulesResponse.ok) {
              const rulesResult = await rulesResponse.json();
              console.log(`[DomainStore] Rules response for ${zoneId}:`, rulesResult);

              if (rulesResult.success) {
                // Combine domain data with rules data
                const templateRulesCount = rulesResult.data.templateRules?.length || 0;
                const customRulesCount = rulesResult.data.customRules?.length || 0;
                const enrichedDomain = {
                  ...updatedDomain,
                  securityRules: {
                    totalRules: templateRulesCount + customRulesCount,
                    corporateRules: templateRulesCount,
                    customRules: customRulesCount,
                    hasConflicts: rulesResult.data.hasConflicts || false
                  }
                };

                console.log(`[DomainStore] Enriched domain with rules:`, enrichedDomain.securityRules);

                set(state => ({
                  allDomains: state.allDomains.map(d =>
                    d.zoneId === zoneId ? enrichedDomain : d
                  ),
                  lastUpdate: new Date()
                }));

                toast.success(`Dominio ${enrichedDomain.domain} actualizado con reglas de seguridad.`);
                return;
              }
            }
          } catch (rulesError) {
            console.warn(`[DomainStore] Failed to get security rules for ${zoneId}:`, rulesError);
          }

          // Fallback: use domain data without fresh rules
          const { allDomains } = get();
          const existingDomain = allDomains.find(d => d.zoneId === zoneId);
          const finalDomain = {
            ...updatedDomain,
            securityRules: existingDomain?.securityRules || updatedDomain.securityRules
          };

          set(state => ({
            allDomains: state.allDomains.map(d => d.zoneId === zoneId ? finalDomain : d),
            lastUpdate: new Date()
          }));

          toast.success(`Dominio ${finalDomain.domain} actualizado (reglas preservadas).`);
          return;
        }
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

  toggleUnderAttackMode: async (zoneId: string, enabled: boolean) => {
    const firewallKey = `${zoneId}-under_attack`;
    set(state => ({ updatingFirewall: new Set(state.updatingFirewall.add(firewallKey)) }));

    const apiToken = tokenStorage.getToken();
    if (!apiToken) {
      toast.error('API Token no encontrado.');
      set(state => {
        const newSet = new Set(state.updatingFirewall);
        newSet.delete(firewallKey);
        return { updatingFirewall: newSet };
      });
      return;
    }

    try {
      const response = await fetch('/api/security-mode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-token': apiToken
        },
        body: JSON.stringify({
          zoneId,
          mode: 'under_attack',
          enabled
        })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        // Update local state
        set(state => ({
          allDomains: state.allDomains.map(d =>
            d.zoneId === zoneId ? { ...d, underAttackMode: enabled } : d
          )
        }));
        toast.success(`Under Attack Mode ${enabled ? 'activado' : 'desactivado'} correctamente.`);
      } else {
        // Show specific error message from API
        const errorMsg = result.error || 'Error al cambiar Under Attack Mode.';
        toast.error(errorMsg);
        console.error('Under Attack Mode toggle failed:', result);
      }
    } catch (error) {
      console.error('Error toggling Under Attack Mode:', error);
      toast.error('Error al cambiar Under Attack Mode.');
    } finally {
      set(state => {
        const newSet = new Set(state.updatingFirewall);
        newSet.delete(firewallKey);
        return { updatingFirewall: newSet };
      });
    }
  },

  toggleBotFightMode: async (zoneId: string, enabled: boolean) => {
    const firewallKey = `${zoneId}-bot_fight`;
    set(state => ({ updatingFirewall: new Set(state.updatingFirewall.add(firewallKey)) }));

    const apiToken = tokenStorage.getToken();
    if (!apiToken) {
      toast.error('API Token no encontrado.');
      set(state => {
        const newSet = new Set(state.updatingFirewall);
        newSet.delete(firewallKey);
        return { updatingFirewall: newSet };
      });
      return;
    }

    try {
      const response = await fetch('/api/security-mode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-token': apiToken
        },
        body: JSON.stringify({
          zoneId,
          mode: 'bot_fight',
          enabled
        })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        // Update local state
        set(state => ({
          allDomains: state.allDomains.map(d =>
            d.zoneId === zoneId ? { ...d, botFightMode: enabled } : d
          )
        }));
        toast.success(`Bot Fight Mode ${enabled ? 'activado' : 'desactivado'} correctamente.`);
      } else {
        // Show specific error message from API
        const errorMsg = result.error || 'Error al cambiar Bot Fight Mode.';
        toast.error(errorMsg);
        console.error('Bot Fight Mode toggle failed:', result);
      }
    } catch (error) {
      console.error('Error toggling Bot Fight Mode:', error);
      toast.error('Error al cambiar Bot Fight Mode.');
    } finally {
      set(state => {
        const newSet = new Set(state.updatingFirewall);
        newSet.delete(firewallKey);
        return { updatingFirewall: newSet };
      });
    }
  },

  bulkToggleProxy: async (enabled: boolean) => {
    const { selectedDomains, allDomains } = get();
    const apiToken = tokenStorage.getToken();

    if (!apiToken) {
      toast.error('API Token no encontrado.');
      return;
    }

    if (selectedDomains.size === 0) {
      toast.error('Selecciona al menos un dominio.');
      return;
    }

    // Get records to update from selected domains
    const recordsToUpdate: Array<{zoneId: string, recordId: string, currentProxied: boolean}> = [];

    selectedDomains.forEach(domainName => {
      const domain = allDomains.find(d => d.domain === domainName);
      if (domain) {
        if (domain.rootRecord) {
          recordsToUpdate.push({
            zoneId: domain.zoneId,
            recordId: domain.rootRecord.id,
            currentProxied: domain.rootProxied
          });
        }
        if (domain.wwwRecord) {
          recordsToUpdate.push({
            zoneId: domain.zoneId,
            recordId: domain.wwwRecord.id,
            currentProxied: domain.wwwProxied
          });
        }
      }
    });

    if (recordsToUpdate.length === 0) {
      toast.error('No hay registros DNS para actualizar en los dominios seleccionados.');
      return;
    }

    // Filter records that actually need changing
    const recordsNeedingUpdate = recordsToUpdate.filter(record => record.currentProxied !== enabled);

    if (recordsNeedingUpdate.length === 0) {
      toast.info(`Todos los registros ya ${enabled ? 'tienen' : 'no tienen'} proxy habilitado.`);
      return;
    }

    try {
      set({ loading: true });
      let successCount = 0;
      let errorCount = 0;

      // Process records in batches
      for (const record of recordsNeedingUpdate) {
        try {
          await get().toggleProxy(record.zoneId, record.recordId, record.currentProxied);
          successCount++;
          // Add small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`Error updating proxy for record ${record.recordId}:`, error);
          errorCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`Proxy ${enabled ? 'habilitado' : 'deshabilitado'} en ${successCount} registros.`);
      }
      if (errorCount > 0) {
        toast.error(`${errorCount} registros fallaron al actualizar.`);
      }

      // Clear selection after bulk operation
      get().clearDomainSelection();

    } catch (error) {
      console.error('Error in bulk proxy toggle:', error);
      toast.error('Error al realizar operación masiva de proxy.');
    } finally {
      set({ loading: false });
    }
  },
}));
