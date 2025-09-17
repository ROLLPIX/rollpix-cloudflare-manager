'use client';

import { useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ProgressPopup } from './ProgressPopup';
import { DomainTableHeader } from './DomainTableHeader';
import { DomainTableFilters } from './DomainTableFilters';
import { DomainTableActions } from './DomainTableActions';
import { DomainTableContent } from './DomainTableContent';
import { DomainTablePagination } from './DomainTablePagination';
import { useDomainTable } from '@/hooks/useDomainTable';

export function DomainTable() {
  const {
    // State
    allDomains,
    loading,
    unifiedProgress,
    isBackgroundRefreshing,
    selectedDomains,
    currentPage,
    perPage,
    searchTerm,
    filterPills,
    totalCount,
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

    // Bulk operations
    handleBulkUnderAttack,
    handleBulkBotFight,
    handleRefreshSelected,

    // Computed values
    updatingRecords,
    updatingFirewall,
    refreshingDomainId,
  } = useDomainTable();

  useEffect(() => {
    if (typeof initializeDomains === 'function') {
      initializeDomains();
    }
  }, [initializeDomains]);

  return (
    <>
      <Card>
        <DomainTableHeader
          totalCount={totalCount}
          processedCount={processedDomains.length}
          loading={loading}
          isBackgroundRefreshing={isBackgroundRefreshing}
          onRefresh={() => fetchFromCloudflareUnified(false, true)}
        />

        <CardContent>
          <DomainTableFilters
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            perPage={perPage}
            onPerPageChange={setPerPage}
            filterPills={filterPills}
          />

          <DomainTableActions
            selectedDomains={selectedDomains}
            allDomains={allDomains}
            onClearSelection={clearDomainSelection}
            onRefreshSelected={handleRefreshSelected}
            onBulkProxy={bulkToggleProxy}
            onBulkUnderAttack={handleBulkUnderAttack}
            onBulkBotFight={handleBulkBotFight}
          />

          <DomainTableContent
            loading={loading}
            allDomains={allDomains}
            paginatedDomains={paginatedDomains}
            selectedDomains={selectedDomains}
            onSelectionChange={toggleDomainSelection}
            onSelectAll={selectAllDomains}
            onToggleProxy={toggleProxy}
            onToggleUnderAttack={toggleUnderAttackMode}
            onToggleBotFight={toggleBotFightMode}
            onRefreshDomain={refreshSingleDomain}
            updatingRecords={updatingRecords}
            updatingFirewall={updatingFirewall}
            refreshingDomainId={refreshingDomainId}
          />

          <DomainTablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            perPage={perPage}
            onPageChange={setCurrentPage}
          />
        </CardContent>
      </Card>

      <ProgressPopup
        isVisible={!!unifiedProgress}
        percentage={unifiedProgress?.percentage || 0}
      />
    </>
  );
}
