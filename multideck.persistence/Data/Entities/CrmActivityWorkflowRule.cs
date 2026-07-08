using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmActivityWorkflowRule
{
    public Guid CrmawruleId { get; set; }

    public string CrmawruleCode { get; set; } = null!;

    public string CrmawruleName { get; set; } = null!;

    public string CrmawruleTriggerTypeCode { get; set; } = null!;

    public string? CrmawruleSourceTable { get; set; }

    public string? CrmawruleActivityTypeCode { get; set; }

    public Guid? CrmawruleOrgOfficeId { get; set; }

    public Guid? CrmawruleLegalEntityId { get; set; }

    public Guid? CrmawruleBrandId { get; set; }

    public Guid? CrmawruleCustomerOrgId { get; set; }

    public string CrmawruleActionKindCode { get; set; } = null!;

    public string? CrmawruleDefaultQuickTaskTypeCode { get; set; }

    public string? CrmawruleDefaultMessageIntentCode { get; set; }

    public string? CrmawruleDefaultChannelCode { get; set; }

    public Guid? CrmawruleDefaultOwnerUserId { get; set; }

    public int? CrmawruleDueOffsetMinutes { get; set; }

    public bool CrmawruleCreateWorkflowTask { get; set; }

    public bool CrmawruleCreateMessageDraft { get; set; }

    public bool CrmawruleAllowIgnore { get; set; }

    public bool CrmawruleRequireUserApproval { get; set; }

    public string CrmawruleConditionsJson { get; set; } = null!;

    public string? CrmawrulePersonalisationInstructions { get; set; }

    public bool CrmawruleIsActive { get; set; }

    public int CrmawruleSortOrder { get; set; }

    public DateTime CrmawruleCreatedAt { get; set; }

    public Guid? CrmawruleCreatedBy { get; set; }

    public DateTime CrmawruleUpdatedAt { get; set; }

    public Guid? CrmawruleUpdatedBy { get; set; }

    public virtual ICollection<CrmActivityWorkflowRun> CrmActivityWorkflowRuns { get; set; } = new List<CrmActivityWorkflowRun>();

    public virtual SysCrmworkflowActionKind CrmawruleActionKindCodeNavigation { get; set; } = null!;

    public virtual SysCrmactivityType? CrmawruleActivityTypeCodeNavigation { get; set; }

    public virtual CmpBrand? CrmawruleBrand { get; set; }

    public virtual CmpUser? CrmawruleCreatedByNavigation { get; set; }

    public virtual OrgMaster? CrmawruleCustomerOrg { get; set; }

    public virtual SysCommChannel? CrmawruleDefaultChannelCodeNavigation { get; set; }

    public virtual SysCrmmessageIntentType? CrmawruleDefaultMessageIntentCodeNavigation { get; set; }

    public virtual CmpUser? CrmawruleDefaultOwnerUser { get; set; }

    public virtual SysCrmquickTaskType? CrmawruleDefaultQuickTaskTypeCodeNavigation { get; set; }

    public virtual CmpLegalEntity? CrmawruleLegalEntity { get; set; }

    public virtual CmpOffice? CrmawruleOrgOffice { get; set; }

    public virtual SysCrmactivityTriggerType CrmawruleTriggerTypeCodeNavigation { get; set; } = null!;

    public virtual CmpUser? CrmawruleUpdatedByNavigation { get; set; }
}
