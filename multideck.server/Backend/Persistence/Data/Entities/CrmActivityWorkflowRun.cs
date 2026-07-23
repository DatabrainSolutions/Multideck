using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmActivityWorkflowRun
{
    public Guid CrmawrunId { get; set; }

    public Guid? CrmawrunRuleId { get; set; }

    public string CrmawrunTriggerTypeCode { get; set; } = null!;

    public string CrmawrunSourceTable { get; set; } = null!;

    public Guid CrmawrunSourceId { get; set; }

    public Guid? CrmawrunActivityId { get; set; }

    public Guid? CrmawrunAccountId { get; set; }

    public Guid? CrmawrunLeadId { get; set; }

    public Guid? CrmawrunOpportunityId { get; set; }

    public Guid? CrmawrunQuoteFollowupId { get; set; }

    public Guid? CrmawrunCallReviewId { get; set; }

    public Guid? CrmawrunJobId { get; set; }

    public Guid? CrmawrunCustomerOrgId { get; set; }

    public Guid? CrmawrunOwnerUserId { get; set; }

    public string CrmawrunStatusCode { get; set; } = null!;

    public int CrmawrunGeneratedQuickTaskCount { get; set; }

    public int CrmawrunGeneratedMessageDraftCount { get; set; }

    public Guid? CrmawrunAitaskRunId { get; set; }

    public string CrmawrunContextJson { get; set; } = null!;

    public DateTime CrmawrunCreatedAt { get; set; }

    public Guid? CrmawrunCreatedBy { get; set; }

    public DateTime? CrmawrunCompletedAt { get; set; }

    public Guid? CrmawrunCompletedBy { get; set; }

    public virtual ICollection<CrmPersonalMessageDraft> CrmPersonalMessageDrafts { get; set; } = new List<CrmPersonalMessageDraft>();

    public virtual ICollection<CrmQuickTask> CrmQuickTasks { get; set; } = new List<CrmQuickTask>();

    public virtual CrmAccountProfile? CrmawrunAccount { get; set; }

    public virtual CrmActivity? CrmawrunActivity { get; set; }

    public virtual AiTaskRun? CrmawrunAitaskRun { get; set; }

    public virtual CrmCallReview? CrmawrunCallReview { get; set; }

    public virtual CmpUser? CrmawrunCompletedByNavigation { get; set; }

    public virtual CmpUser? CrmawrunCreatedByNavigation { get; set; }

    public virtual OrgMaster? CrmawrunCustomerOrg { get; set; }

    public virtual JobHeader? CrmawrunJob { get; set; }

    public virtual CrmLead? CrmawrunLead { get; set; }

    public virtual CrmOpportunity? CrmawrunOpportunity { get; set; }

    public virtual CmpUser? CrmawrunOwnerUser { get; set; }

    public virtual CrmQuoteFollowup? CrmawrunQuoteFollowup { get; set; }

    public virtual CrmActivityWorkflowRule? CrmawrunRule { get; set; }

    public virtual SysCrmdecisionStatus CrmawrunStatusCodeNavigation { get; set; } = null!;

    public virtual SysCrmactivityTriggerType CrmawrunTriggerTypeCodeNavigation { get; set; } = null!;
}
