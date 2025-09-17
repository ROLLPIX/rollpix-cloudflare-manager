'use client';

import { useState, useMemo } from 'react';
import { DomainStatus } from '@/types/cloudflare';
import { useDomainStore } from '@/store/domainStore';
import { useNotifications } from './useNotifications';

export function useDomainTable() {
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
    refreshSingleDomain,
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

  const notifications = useNotifications();

  // Computed values
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

  // Bulk operations with notifications
  const handleBulkUnderAttack = async (enabled: boolean) => {
    const selectedZoneIds = allDomains.filter(d => selectedDomains.has(d.domain)).map(d => d.zoneId);

    if (selectedZoneIds.length === 0) {
      notifications.error('Selecciona al menos un dominio');
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const zoneId of selectedZoneIds) {
      try {
        await toggleUnderAttackMode(zoneId, enabled);
        successCount++;
      } catch (error) {
        console.error(`Error toggling Under Attack for ${zoneId}:`, error);
        errorCount++;
      }
    }

    if (successCount > 0) {
      notifications.domainOperation.success(
        `Under Attack ${enabled ? 'habilitado' : 'deshabilitado'}`,
        successCount
      );
    }
    if (errorCount > 0) {
      notifications.error(`${errorCount} dominios fallaron al actualizar`);
    }
  };

  const handleBulkBotFight = async (enabled: boolean) => {
    const selectedZoneIds = allDomains.filter(d => selectedDomains.has(d.domain)).map(d => d.zoneId);

    if (selectedZoneIds.length === 0) {
      notifications.error('Selecciona al menos un dominio');
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const zoneId of selectedZoneIds) {
      try {
        await toggleBotFightMode(zoneId, enabled);
        successCount++;
      } catch (error) {
        console.error(`Error toggling Bot Fight for ${zoneId}:`, error);
        errorCount++;
      }
    }

    if (successCount > 0) {
      notifications.domainOperation.success(
        `Bot Fight ${enabled ? 'habilitado' : 'deshabilitado'}`,
        successCount
      );
    }
    if (errorCount > 0) {
      notifications.error(`${errorCount} dominios fallaron al actualizar`);
    }
  };

  const handleRefreshSelected = async (zoneIds: string[]) => {
    await refreshMultipleDomains(zoneIds);
  };

  return {
    // State
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
    processedDomains,
    paginatedDomains,
    totalPages,

    // Actions
    initializeDomains,
    fetchFromCloudflareUnified,
    refreshSingleDomain,
    setSearchTerm,
    setCurrentPage,
    setPerPage,
    toggleDomainSelection,
    selectAllDomains,
    clearDomainSelection,
    toggleUnderAttackMode,
    toggleBotFightMode,
    toggleProxy,
    bulkToggleProxy,

    // Bulk operations with notifications
    handleBulkUnderAttack,
    handleBulkBotFight,
    handleRefreshSelected,

    // Computed values
    updatingRecords,
    updatingFirewall,
  };
}