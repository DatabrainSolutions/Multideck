using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmAutomationPlaybook
{
    public Guid CrmautoPlaybookId { get; set; }

    public string CrmautoPlaybookCode { get; set; } = null!;

    public string CrmautoPlaybookName { get; set; } = null!;

    public string? CrmautoPlaybookDescription { get; set; }

    public string CrmautoPlaybookActionTypeCode { get; set; } = null!;

    public string? CrmautoPlaybookTriggerTypeCode { get; set; }

    public string? CrmautoPlaybookQuickTaskTypeCode { get; set; }

    public string? CrmautoPlaybookTargetRecordTypeCode { get; set; }

    public string? CrmautoPlaybookTargetTable { get; set; }

    public Guid? CrmautoPlaybookOrgOfficeId { get; set; }

    public Guid? CrmautoPlaybookLegalEntityId { get; set; }

    public Guid? CrmautoPlaybookBrandId { get; set; }

    public Guid? CrmautoPlaybookCustomerOrgId { get; set; }

    public bool CrmautoPlaybookRequiresWizard { get; set; }

    public bool CrmautoPlaybookRequiresExternalRequest { get; set; }

    public bool CrmautoPlaybookAutoQueueFieldUpdates { get; set; }

    public bool CrmautoPlaybookAutoApplyAllowed { get; set; }

    public bool CrmautoPlaybookRequireApprovalBeforeApply { get; set; }

    public string? CrmautoPlaybookDefaultChannelCode { get; set; }

    public string? CrmautoPlaybookMessageIntentCode { get; set; }

    public string? CrmautoPlaybookInstructions { get; set; }

    public bool CrmautoPlaybookIsActive { get; set; }

    public DateTime CrmautoPlaybookCreatedAt { get; set; }

    public Guid? CrmautoPlaybookCreatedBy { get; set; }

    public DateTime CrmautoPlaybookUpdatedAt { get; set; }

    public Guid? CrmautoPlaybookUpdatedBy { get; set; }

    public virtual ICollection<CrmAutomationFieldDefinition> CrmAutomationFieldDefinitions { get; set; } = new List<CrmAutomationFieldDefinition>();

    public virtual ICollection<CrmAutomationPlaybookStep> CrmAutomationPlaybookSteps { get; set; } = new List<CrmAutomationPlaybookStep>();

    public virtual ICollection<CrmAutomationRun> CrmAutomationRuns { get; set; } = new List<CrmAutomationRun>();

    public virtual SysCrmautomationActionType CrmautoPlaybookActionTypeCodeNavigation { get; set; } = null!;

    public virtual CmpBrand? CrmautoPlaybookBrand { get; set; }

    public virtual CmpUser? CrmautoPlaybookCreatedByNavigation { get; set; }

    public virtual OrgMaster? CrmautoPlaybookCustomerOrg { get; set; }

    public virtual SysCommChannel? CrmautoPlaybookDefaultChannelCodeNavigation { get; set; }

    public virtual CmpLegalEntity? CrmautoPlaybookLegalEntity { get; set; }

    public virtual SysCrmmessageIntentType? CrmautoPlaybookMessageIntentCodeNavigation { get; set; }

    public virtual CmpOffice? CrmautoPlaybookOrgOffice { get; set; }

    public virtual SysCrmquickTaskType? CrmautoPlaybookQuickTaskTypeCodeNavigation { get; set; }

    public virtual SysWorkflowRecordType? CrmautoPlaybookTargetRecordTypeCodeNavigation { get; set; }

    public virtual SysCrmactivityTriggerType? CrmautoPlaybookTriggerTypeCodeNavigation { get; set; }

    public virtual CmpUser? CrmautoPlaybookUpdatedByNavigation { get; set; }
}
