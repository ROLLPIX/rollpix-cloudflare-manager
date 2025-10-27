import { create } from 'zustand';
import { DomainStatus } from '@/types/cloudflare';
import { tokenStorage } from '@/lib/tokenStorage';
import { settingsStorage } from '@/lib/settingsStorage';
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
  unifiedProgress: {
    requestId?: string;
    percentage: number;
    phase?: 1 | 2;
    phaseLabel?: string;
    current?: number;
    total?: number;
    currentBatch?: number;
    totalBatches?: number;
    currentDomainName?: string;
    isWaitingRateLimit?: boolean;
  } | null;
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
  fetchFromCloudflareUnified: (isBackground?: boolean, forceRefresh?: boolean) => Promise<void>;
  fetchWithRules: () => Promise<void>;
  refreshSingleDomain: (zoneId: string) => Promise<void>;
  refreshMultipleDomains: (zoneIds: string[]) => Promise<void>;
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
  invalidateDomainsCache: () => Promise<void>;
}

export const useDomainStore = create<DomainState & DomainActions>((set, get) => ({
  allDomains: [],
  loading: false,
  loadingProgress: null,
  unifiedProgress: null,
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

  // New unified fetch strategy - gets complete domain info in single pass
  fetchFromCloudflareUnified: async (isBackground = false, forceRefresh = false) => {
    // Always show progress for non-background calls
    const showProgress = !isBackground;

    if (showProgress) {
      set({
        loading: true,
        loadingProgress: { completed: 0, total: 1 },
        unifiedProgress: { percentage: 0 }
      });
    } else {
      set({ isBackgroundRefreshing: true });
    }

    const apiToken = tokenStorage.getToken();
    console.log('[DomainStore] Unified fetch - Token:', apiToken ? `${apiToken.substring(0, 8)}...` : 'null');

    if (!apiToken) {
      // Only show toast if we're in client-side environment
      if (typeof window !== 'undefined') {
        toast.error('API Token no encontrado.');
      } else {
        console.error('[DomainStore] API Token no encontrado (server-side)');
      }
      set({ loading: false, isBackgroundRefreshing: false });
      return;
    }

    // Get rate limiting settings
    const rateLimiting = settingsStorage.getRateLimiting();

    // Generate requestId on client side for progress tracking
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    console.log(`[DomainStore] Generated requestId: ${requestId}`);

    // Progress polling
    let progressInterval: NodeJS.Timeout | null = null;

    try {
      console.log(`[DomainStore] Starting unified fetch - forceRefresh: ${forceRefresh}`);

      // Start polling for progress if showProgress is enabled
      if (showProgress) {
        // Poll progress endpoint every 500ms
        progressInterval = setInterval(async () => {
          try {
            const progressResponse = await fetch(`/api/domains/progress/${requestId}`);
            if (progressResponse.ok) {
              const progressData = await progressResponse.json();
              if (progressData.success && progressData.data) {
                const {
                  phase,
                  phaseLabel,
                  percentage,
                  current,
                  total,
                  completed,
                  currentBatch,
                  totalBatches,
                  currentDomainName,
                  isWaitingRateLimit
                } = progressData.data;

                set({
                  unifiedProgress: {
                    requestId,
                    percentage,
                    phase,
                    phaseLabel,
                    current,
                    total,
                    currentBatch,
                    totalBatches,
                    currentDomainName,
                    isWaitingRateLimit
                  }
                });

                console.log(`[DomainStore] Progress: Phase ${phase} - ${percentage}% (${current}/${total})`);

                // Stop polling if completed and load final data
                if (completed && progressInterval) {
                  clearInterval(progressInterval);
                  progressInterval = null;

                  console.log('[DomainStore] Processing completed, loading final data from cache...');

                  // Wait a bit for cache to be written
                  setTimeout(async () => {
                    try {
                      const cacheResponse = await fetch('/api/domains/complete');
                      if (cacheResponse.ok) {
                        const cacheData = await cacheResponse.json();
                        if (cacheData.success && cacheData.data) {
                          const { domains, totalCount, lastUpdate } = cacheData.data;

                          // Show 100% progress briefly
                          set({
                            unifiedProgress: {
                              percentage: 100,
                              phase: 2,
                              phaseLabel: 'Completado',
                              current: totalCount,
                              total: totalCount
                            }
                          });

                          // Hide progress after 1 second
                          setTimeout(() => {
                            set({ unifiedProgress: null });
                          }, 1000);

                          // Update domains
                          set({
                            allDomains: domains,
                            totalCount: totalCount,
                            lastUpdate: new Date(lastUpdate),
                            loading: false,
                            isBackgroundRefreshing: false
                          });

                          // Show success message
                          const templateRules = domains.reduce((sum: number, d: any) => sum + (d.securityRules?.corporateRules || 0), 0);
                          const message = `${totalCount} dominios procesados completamente (${templateRules} reglas template)`;
                          if (!isBackground) {
                            toast.success(message);
                          }
                          console.log(`[DomainStore] ${message}`);
                        }
                      }
                    } catch (error) {
                      console.error('[DomainStore] Error loading final data:', error);
                      toast.error('Procesamiento completado pero falló al cargar datos');
                    }
                  }, 500);
                }
              }
            } else if (progressResponse.status === 404) {
              // Progress not yet initialized, keep polling
              console.log('[DomainStore] Progress not yet available, waiting...');
            }
          } catch (error) {
            console.error('[DomainStore] Error polling progress:', error);
          }
        }, 500);
      }

      // Start the unified fetch with requestId (fire and forget - don't wait for response)
      const unifiedPromise = fetch('/api/domains/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiToken,
          zoneIds: [], // Empty means process all zones
          forceRefresh,
          batchSize: rateLimiting.batchSize,
          batchDelay: rateLimiting.batchDelay,
          requestId: requestId // Send requestId to API
        })
      });

      // Polling handles everything - we don't need to wait for POST response
      // The POST runs in background and polling tracks progress
      console.log('[DomainStore] POST request initiated, polling will track progress...');

      // Handle POST completion/errors in background (optional logging)
      unifiedPromise.then(async response => {
        if (!response.ok) {
          console.error('[DomainStore] POST request failed with status:', response.status);
        } else {
          const data = await response.json();
          console.log('[DomainStore] POST request completed:', data.success ? 'success' : 'with errors');
        }
      }).catch(error => {
        console.error('[DomainStore] POST request error:', error);
        // Don't stop polling - let it continue until server marks as completed or times out
      });

    } catch (error) {
      console.error('[DomainStore] Error starting unified fetch:', error);

      // Clear progress interval on initialization error only
      if (progressInterval) {
        clearInterval(progressInterval);
      }

      set({
        loading: false,
        isBackgroundRefreshing: false,
        unifiedProgress: null
      });

      if (!isBackground) {
        toast.error('Error al iniciar actualización de dominios');
      }
    }
  },

  fetchFromCloudflare: async (isBackground = false, includeRules = false) => {
    if (!isBackground) {
      set({ loading: true, loadingProgress: { completed: 0, total: 1 } });
    } else {
      set({ isBackgroundRefreshing: true });
    }
    const apiToken = tokenStorage.getToken();
    console.log('[DomainStore] Token being used:', apiToken ? `${apiToken.substring(0, 8)}...` : 'null');
    if (!apiToken) {
      // Only show toast if we're in client-side environment
      if (typeof window !== 'undefined') {
        toast.error('API Token no encontrado.');
      } else {
        console.error('[DomainStore] API Token no encontrado (server-side)');
      }
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
      // Load preferences first (this is usually fast)
      try {
        const preferencesResponse = await fetch('/api/preferences');
        if (preferencesResponse.ok) {
          const prefs = await preferencesResponse.json();
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
          console.log('[DomainStore] Preferences loaded successfully');
        }
      } catch (prefsError) {
        console.warn('[DomainStore] Failed to load preferences:', prefsError);
        // Continue without preferences - use defaults
      }

      // Try to load cache (with timeout to prevent hanging)
      try {
        console.log('[DomainStore] Attempting to load domains cache...');

        // Add timeout to prevent hanging
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        const cacheResponse = await fetch('/api/domains/complete', {
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (cacheResponse.ok) {
          const cacheData = await cacheResponse.json();
          console.log('[DomainStore] Cache response received:', cacheData);

          // Handle unified cache structure
          const domains = cacheData.success ? cacheData.data?.domains : cacheData.domains;
          const totalCount = cacheData.success ? cacheData.data?.totalCount : cacheData.totalCount;
          const lastUpdate = cacheData.success ? cacheData.data?.lastUpdate : cacheData.lastUpdate;

          if (domains && Array.isArray(domains) && domains.length > 0) {
            const loadTime = Date.now() - startTime;
            console.log(`[DomainStore] Cache loaded in ${loadTime}ms with ${domains.length} domains`);

            set({
              allDomains: domains,
              totalCount: totalCount || domains.length,
              lastUpdate: lastUpdate ? new Date(lastUpdate) : new Date()
            });

            toast.success(`${domains.length} dominios cargados desde caché.`);
            return;
          } else {
            console.log('[DomainStore] Cache exists but no valid domains found');
          }
        } else {
          console.log('[DomainStore] Cache request failed with status:', cacheResponse.status);
        }
      } catch (cacheError) {
        if (cacheError instanceof Error && cacheError.name === 'AbortError') {
          console.warn('[DomainStore] Cache loading timed out after 10 seconds');
        } else {
          console.warn('[DomainStore] Cache loading failed:', cacheError);
        }
      }

      console.log('[DomainStore] No valid cache available.');

      // No auto-fetch - let user decide when to refresh
      const apiToken = tokenStorage.getToken();
      if (apiToken) {
        console.log('[DomainStore] No hay datos en caché. Usa "Actualizar Todo" para obtener dominios de Cloudflare.');
        toast.info('No hay datos en caché. Usa "Actualizar Todo" para cargar dominios desde Cloudflare.');
      } else {
        console.log('[DomainStore] No API token available');
        toast.info('Introduce tu token de Cloudflare para comenzar.');
      }

    } catch (error) {
      console.error('[DomainStore] Error in initializeDomains:', error);
      toast.error('Error al inicializar la aplicación. Recarga la página.');
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
    console.log(`[DomainStore] Starting unified refresh for domain ${zoneId}`);
    set({ refreshingDomainId: zoneId });
    const apiToken = tokenStorage.getToken();
    if (!apiToken) {
      toast.error('API Token no encontrado.');
      set({ refreshingDomainId: null });
      return;
    }

    try {
      console.log(`[DomainStore] Using unified sync logic for domain ${zoneId}`);

      // Get rate limiting settings
      const rateLimiting = settingsStorage.getRateLimiting();

      // NEW v3.1.0: Use unified sync logic via /api/domains/complete
      const unifiedResponse = await fetch('/api/domains/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-token': apiToken
        },
        body: JSON.stringify({
          apiToken,
          zoneIds: [zoneId], // Refresh only this specific domain
          forceRefresh: true,
          batchSize: rateLimiting.batchSize,
          batchDelay: rateLimiting.batchDelay
        })
      });

      if (!unifiedResponse.ok) {
        throw new Error('Failed to get unified domain data');
      }

      const unifiedData = await unifiedResponse.json();
      console.log(`[DomainStore] Unified refresh response for ${zoneId}:`, unifiedData);

      if (unifiedData.success && unifiedData.data.domains.length > 0) {
        const updatedDomain = unifiedData.data.domains[0];

        console.log(`[DomainStore] Updated domain with unified sync:`, {
          domain: updatedDomain.domain,
          totalRules: updatedDomain.securityRules?.totalRules || 0,
          templateRules: updatedDomain.securityRules?.templateRules?.length || 0,
          hasConflicts: updatedDomain.securityRules?.hasConflicts || false
        });

        // Update store with new unified data
        set(state => ({
          allDomains: state.allDomains.map(d =>
            d.zoneId === zoneId ? updatedDomain : d
          ),
          lastUpdate: new Date()
        }));

        // Log sync summary
        const syncSummary = unifiedData.data.summary?.templateAutoImport;
        if (syncSummary) {
          console.log(`[DomainStore] Template sync summary:`, {
            imported: syncSummary.imported || 0,
            updated: syncSummary.updated || 0,
            newTemplates: syncSummary.newTemplates?.length || 0
          });

          if (syncSummary.imported > 0 || syncSummary.updated > 0) {
            toast.success(`Dominio actualizado: ${syncSummary.imported} plantillas nuevas, ${syncSummary.updated} actualizadas`);
          }
        }

        console.log(`[DomainStore] Domain ${zoneId} unified refresh completed successfully`);
        return;
      }

      throw new Error('No unified data received');

    } catch (error) {
      console.error(`[DomainStore] Error in unified refresh for domain ${zoneId}:`, error);

      try {
        // FALLBACK: Try legacy individual refresh method
        console.log(`[DomainStore] Falling back to legacy refresh method for ${zoneId}`);

        const domainResponse = await fetch(`/api/domains?zoneId=${zoneId}`, {
          headers: { 'x-api-token': apiToken },
        });

        if (domainResponse.ok) {
          const domainData = await domainResponse.json();
          const updatedDomain = domainData.domains?.[0];

          if (updatedDomain) {
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

            toast.info(`Dominio ${updatedDomain.domain} actualizado (método de respaldo)`);
            console.log(`[DomainStore] Domain ${zoneId} fallback refresh completed`);
            return;
          }
        }

        throw new Error('Fallback refresh also failed');

      } catch (fallbackError) {
        console.error(`[DomainStore] Fallback refresh failed for ${zoneId}:`, fallbackError);
        toast.error(`Error al actualizar dominio: ${error instanceof Error ? error.message : 'Error desconocido'}`);
      }
    } finally {
      set({ refreshingDomainId: null });
    }
  },

  refreshMultipleDomains: async (zoneIds: string[]) => {
    if (zoneIds.length === 0) return;

    console.log(`[DomainStore] Refreshing ${zoneIds.length} domains using global sync:`, zoneIds);

    // Show progress for multiple domain refresh
    set({ unifiedProgress: { percentage: 0 } });

    const apiToken = tokenStorage.getToken();
    if (!apiToken) {
      toast.error('API Token no encontrado.');
      set({ unifiedProgress: null });
      return;
    }

    try {
      console.log(`[DomainStore] Using unified global sync for ALL domains (not filtering by zoneIds)`);

      // Get rate limiting settings
      const rateLimiting = settingsStorage.getRateLimiting();

      // Use global sync for ALL domains to avoid showing only selected ones
      // We'll filter locally which domains to update, but fetch all data
      const unifiedResponse = await fetch('/api/domains/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-token': apiToken
        },
        body: JSON.stringify({
          apiToken,
          // DON'T pass zoneIds - fetch ALL domains
          forceRefresh: true,
          batchSize: rateLimiting.batchSize,
          batchDelay: rateLimiting.batchDelay
        })
      });

      if (!unifiedResponse.ok) {
        throw new Error('Failed to get unified domain data');
      }

      const unifiedResult = await unifiedResponse.json();
      console.log(`[DomainStore] Unified refresh result:`, unifiedResult);

      if (unifiedResult.success && unifiedResult.data?.domains) {
        const allRefreshedDomains = unifiedResult.data.domains;
        console.log(`[DomainStore] Got ${allRefreshedDomains.length} total domains from unified sync`);

        // Update the store with ALL refreshed domains (complete replacement)
        // But only report success for the requested zoneIds
        const targetZoneSet = new Set(zoneIds);
        const updatedTargetDomains = allRefreshedDomains.filter((domain: DomainStatus) =>
          targetZoneSet.has(domain.zoneId)
        );

        set({ allDomains: allRefreshedDomains });

        console.log(`[DomainStore] Updated ${updatedTargetDomains.length}/${zoneIds.length} requested domains in complete dataset of ${allRefreshedDomains.length} domains`);

        toast.success(`${updatedTargetDomains.length} dominios actualizados correctamente con sincronización global.`);
      } else {
        throw new Error(unifiedResult.error || 'Failed to refresh domains');
      }

    } catch (error) {
      console.error('[DomainStore] Error in bulk domain refresh:', error);
      toast.error('Error al actualizar dominios. Intenta de nuevo.');
    } finally {
      // Hide progress after completion
      setTimeout(() => {
        set({ unifiedProgress: null });
      }, 1000);
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

  invalidateDomainsCache: async () => {
    console.log('[DomainStore] Invalidating domains cache due to template version change');

    // Check if we have a token first
    const apiToken = tokenStorage.getToken();
    if (!apiToken) {
      console.warn('[DomainStore] No API token available for cache invalidation, skipping');
      return;
    }

    try {
      // Force fetch from Cloudflare with rules analysis
      await get().fetchFromCloudflareUnified(false, true);
      console.log('[DomainStore] Cache invalidation completed successfully');
    } catch (error) {
      console.warn('[DomainStore] Failed to invalidate cache:', error);
      throw error;
    }
  },
}));

// Export the invalidation function for use in API routes
export const invalidateDomainsCache = async () => {
  const store = useDomainStore.getState();
  await store.invalidateDomainsCache();
};
