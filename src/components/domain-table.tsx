'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ProgressPopup } from './ProgressPopup';
import { DomainTableHeader } from './DomainTableHeader';
import { DomainTableFilters } from './DomainTableFilters';
import { DomainTableContent } from './DomainTableContent';
import { DomainTablePagination } from './DomainTablePagination';
import { RulesActionBar } from './RulesActionBar';
import { TemplateManagementModal } from './TemplateManagementModal';
import { useDomainTable } from '@/hooks/useDomainTable';
import { tokenStorage } from '@/lib/tokenStorage';
import { toast } from 'sonner';

export function DomainTable() {
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [availableTemplates, setAvailableTemplates] = useState<Array<{
    id: string;
    friendlyId: string;
    name: string;
    applied: boolean;
  }>>([]);

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

  useEffect(() => {
    loadAvailableTemplates();
  }, []);

  const loadAvailableTemplates = async () => {
    try {
      const response = await fetch('/api/security-rules');
      if (response.ok) {
        const data = await response.json();
        const templates = data.templates || [];

        // Analyze which templates are applied across selected domains
        const selectedZoneIds = Array.from(selectedDomains).map(domain => {
          const domainObj = allDomains.find(d => d.domain === domain);
          return domainObj?.zoneId || '';
        }).filter(Boolean);

        const templatesWithStatus = templates.map((template: any) => {
          // Check if this template is applied to all selected domains
          const appliedCount = selectedZoneIds.filter(zoneId => {
            const domain = allDomains.find(d => d.zoneId === zoneId);
            return domain?.securityRules?.templateRules?.some(rule =>
              rule.friendlyId === template.friendlyId
            );
          }).length;

          return {
            id: template.id,
            friendlyId: template.friendlyId,
            name: template.name,
            applied: appliedCount === selectedZoneIds.length && selectedZoneIds.length > 0
          };
        });

        setAvailableTemplates(templatesWithStatus);
      }
    } catch (error) {
      console.error('Error loading templates:', error);
    }
  };

  // Reload templates when selection changes
  useEffect(() => {
    loadAvailableTemplates();
  }, [selectedDomains, allDomains]);

  const handleApplyRules = async (ruleIds: string[]) => {
    const apiToken = tokenStorage.getToken();
    if (!apiToken) {
      toast.error('Token API no encontrado');
      return;
    }

    const selectedZoneIds = Array.from(selectedDomains).map(domain => {
      const domainObj = allDomains.find(d => d.domain === domain);
      return domainObj?.zoneId || '';
    }).filter(Boolean);

    if (selectedZoneIds.length === 0) {
      toast.error('No hay dominios seleccionados');
      return;
    }

    try {
      const response = await fetch('/api/domains/rules/bulk-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-token': apiToken
        },
        body: JSON.stringify({
          action: 'add',
          targetZoneIds: selectedZoneIds,
          selectedRules: ruleIds
        })
      });

      if (response.ok) {
        const result = await response.json();
        toast.success(`Reglas aplicadas exitosamente a ${result.successful || selectedZoneIds.length} dominios`);

        // Refresh the affected domains
        for (const zoneId of selectedZoneIds) {
          await refreshSingleDomain(zoneId);
        }

        // Reload templates to update applied status
        await loadAvailableTemplates();
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Error al aplicar reglas');
      }
    } catch (error) {
      console.error('Error applying rules:', error);
      toast.error(error instanceof Error ? error.message : 'Error al aplicar reglas');
    }
  };

  const handleRemoveRules = async (ruleIds: string[]) => {
    const apiToken = tokenStorage.getToken();
    if (!apiToken) {
      toast.error('Token API no encontrado');
      return;
    }

    const selectedZoneIds = Array.from(selectedDomains).map(domain => {
      const domainObj = allDomains.find(d => d.domain === domain);
      return domainObj?.zoneId || '';
    }).filter(Boolean);

    if (selectedZoneIds.length === 0) {
      toast.error('No hay dominios seleccionados');
      return;
    }

    try {
      const response = await fetch('/api/domains/rules/bulk-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-token': apiToken
        },
        body: JSON.stringify({
          action: 'remove',
          targetZoneIds: selectedZoneIds,
          selectedRules: ruleIds
        })
      });

      if (response.ok) {
        const result = await response.json();
        toast.success(`Reglas eliminadas exitosamente de ${result.successful || selectedZoneIds.length} dominios`);

        // Refresh the affected domains
        for (const zoneId of selectedZoneIds) {
          await refreshSingleDomain(zoneId);
        }

        // Reload templates to update applied status
        await loadAvailableTemplates();
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Error al eliminar reglas');
      }
    } catch (error) {
      console.error('Error removing rules:', error);
      toast.error(error instanceof Error ? error.message : 'Error al eliminar reglas');
    }
  };

  const handleSyncOutdated = async () => {
    const apiToken = tokenStorage.getToken();
    if (!apiToken) {
      toast.error('Token API no encontrado');
      return;
    }

    const selectedZoneIds = Array.from(selectedDomains).map(domain => {
      const domainObj = allDomains.find(d => d.domain === domain);
      return domainObj?.zoneId || '';
    }).filter(Boolean);

    if (selectedZoneIds.length === 0) {
      toast.error('No hay dominios seleccionados');
      return;
    }

    try {
      // Find outdated rules across selected domains
      const outdatedRules: string[] = [];

      selectedZoneIds.forEach(zoneId => {
        const domain = allDomains.find(d => d.zoneId === zoneId);
        const templateRules = domain?.securityRules?.templateRules || [];

        templateRules.forEach(rule => {
          if (rule.isOutdated && !outdatedRules.includes(rule.friendlyId)) {
            // Find the template ID for this friendlyId
            const template = availableTemplates.find(t => t.friendlyId === rule.friendlyId);
            if (template) {
              outdatedRules.push(template.id);
            }
          }
        });
      });

      if (outdatedRules.length === 0) {
        toast.info('No hay reglas desactualizadas en los dominios seleccionados');
        return;
      }

      const response = await fetch('/api/domains/rules/bulk-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-token': apiToken
        },
        body: JSON.stringify({
          action: 'add', // 'add' will update existing rules with same friendlyId
          targetZoneIds: selectedZoneIds,
          selectedRules: outdatedRules
        })
      });

      if (response.ok) {
        const result = await response.json();
        toast.success(`Reglas actualizadas exitosamente en ${result.successful || selectedZoneIds.length} dominios`);

        // Refresh the affected domains
        for (const zoneId of selectedZoneIds) {
          await refreshSingleDomain(zoneId);
        }

        // Reload templates to update applied status
        await loadAvailableTemplates();
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Error al actualizar reglas');
      }
    } catch (error) {
      console.error('Error syncing outdated rules:', error);
      toast.error(error instanceof Error ? error.message : 'Error al actualizar reglas desactualizadas');
    }
  };

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


          <RulesActionBar
            selectedDomains={Array.from(selectedDomains).map(domain => {
              const domainObj = allDomains.find(d => d.domain === domain);
              return domainObj?.zoneId || '';
            }).filter(Boolean)}
            onClearSelection={clearDomainSelection}
            onRefreshSelectedDomains={(zoneIds) => handleRefreshSelected(zoneIds)}
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

      <TemplateManagementModal
        isOpen={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
      />
    </>
  );
}
