'use client';

import { SecurityRulesHeader } from './SecurityRulesHeader';
import { SecurityRulesEmptyState } from './SecurityRulesEmptyState';
import { RuleTemplateCard } from './RuleTemplateCard';
import { RuleTemplateDialog } from './RuleTemplateDialog';
import { BulkUpdatePreviewModal } from './BulkUpdatePreviewModal';
import { RuleUpdateConfirmationModal } from './RuleUpdateConfirmationModal';
import { useSecurityRulesManager } from '@/hooks/useSecurityRulesManager';

export default function SecurityRulesManager() {
  const {
    templates,
    loading,
    showCreateDialog,
    showEditDialog,
    editingTemplate,
    updatingTemplate,
    formData,
    showPreviewModal,
    previewData,
    showUpdateConfirmation,
    updateConfirmationData,
    ruleUsageStats,
    setShowCreateDialog,
    setShowEditDialog,
    setShowPreviewModal,
    setShowUpdateConfirmation,
    setUpdateConfirmationData,
    handleEditTemplate,
    handleUpdateAllDomains,
    executeBulkUpdate,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    updateFormField,
    handleRuleUpdateConfirmation,
    registerProgressCallback,
  } = useSecurityRulesManager();


  return (
    <div className="space-y-6">
      <SecurityRulesHeader
        templateCount={templates.length}
        onCreateNew={() => setShowCreateDialog(true)}
      />

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">Plantillas de Reglas ({templates.length})</h3>
        </div>

        {templates.length === 0 ? (
          <SecurityRulesEmptyState onCreateNew={() => setShowCreateDialog(true)} />
        ) : (
          <div className="grid gap-4">
            {templates.map((template) => (
              <RuleTemplateCard
                key={template.id}
                template={template}
                isUpdating={updatingTemplate === template.id}
                usageStats={ruleUsageStats.get(template.friendlyId)}
                onEdit={handleEditTemplate}
                onUpdateAll={handleUpdateAllDomains}
                onDelete={deleteTemplate}
              />
            ))}
          </div>
        )}
      </div>

      <RuleTemplateDialog
        isOpen={showCreateDialog}
        isEdit={false}
        formData={formData}
        onFormChange={updateFormField}
        onSave={createTemplate}
        onClose={() => setShowCreateDialog(false)}
      />

      <RuleTemplateDialog
        isOpen={showEditDialog}
        isEdit={true}
        formData={formData}
        onFormChange={updateFormField}
        onSave={updateTemplate}
        onClose={() => setShowEditDialog(false)}
      />

      {previewData && (
        <BulkUpdatePreviewModal
          isOpen={showPreviewModal}
          onClose={() => setShowPreviewModal(false)}
          onConfirm={executeBulkUpdate}
          template={previewData.template}
          domains={previewData.domains}
          isUpdating={updatingTemplate !== null}
        />
      )}

      {updateConfirmationData && (
        <RuleUpdateConfirmationModal
          isOpen={showUpdateConfirmation}
          onClose={() => {
            setShowUpdateConfirmation(false);
            setUpdateConfirmationData(null);
          }}
          template={updateConfirmationData.template}
          affectedDomains={updateConfirmationData.affectedDomains}
          onConfirm={handleRuleUpdateConfirmation}
          onUpdateProgress={registerProgressCallback}
        />
      )}
    </div>
  );
}
