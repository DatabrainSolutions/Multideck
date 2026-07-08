using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmQuickTask
{
    public Guid CrmquickTaskId { get; set; }

    public Guid? CrmquickTaskRunId { get; set; }

    public string CrmquickTaskTaskTypeCode { get; set; } = null!;

    public string CrmquickTaskStatusCode { get; set; } = null!;

    public string CrmquickTaskDecisionStatusCode { get; set; } = null!;

    public Guid? CrmquickTaskWorkflowTaskId { get; set; }

    public Guid? CrmquickTaskAccountId { get; set; }

    public Guid? CrmquickTaskLeadId { get; set; }

    public Guid? CrmquickTaskOpportunityId { get; set; }

    public Guid? CrmquickTaskQuoteFollowupId { get; set; }

    public Guid? CrmquickTaskCallReviewId { get; set; }

    public Guid? CrmquickTaskJobId { get; set; }

    public Guid? CrmquickTaskCustomerOrgId { get; set; }

    public Guid? CrmquickTaskAssignedUserId { get; set; }

    public string CrmquickTaskTitle { get; set; } = null!;

    public string? CrmquickTaskDescription { get; set; }

    public string CrmquickTaskPriorityCode { get; set; } = null!;

    public DateTime? CrmquickTaskDueAt { get; set; }

    public DateTime? CrmquickTaskSnoozedUntil { get; set; }

    public string? CrmquickTaskActionTargetTable { get; set; }

    public Guid? CrmquickTaskActionTargetId { get; set; }

    public string CrmquickTaskActionPayloadJson { get; set; } = null!;

    public string? CrmquickTaskUserDecisionReason { get; set; }

    public DateTime CrmquickTaskCreatedAt { get; set; }

    public Guid? CrmquickTaskCreatedBy { get; set; }

    public DateTime CrmquickTaskUpdatedAt { get; set; }

    public Guid? CrmquickTaskUpdatedBy { get; set; }

    public DateTime? CrmquickTaskCompletedAt { get; set; }

    public Guid? CrmquickTaskCompletedBy { get; set; }

    public virtual ICollection<CrmAutomationRun> CrmAutomationRuns { get; set; } = new List<CrmAutomationRun>();

    public virtual ICollection<CrmDataRequest> CrmDataRequests { get; set; } = new List<CrmDataRequest>();

    public virtual ICollection<CrmPersonalMessageDraft> CrmPersonalMessageDrafts { get; set; } = new List<CrmPersonalMessageDraft>();

    public virtual ICollection<CrmQuickTaskDecision> CrmQuickTaskDecisions { get; set; } = new List<CrmQuickTaskDecision>();

    public virtual ICollection<CrmQuickTaskOption> CrmQuickTaskOptions { get; set; } = new List<CrmQuickTaskOption>();

    public virtual CrmAccountProfile? CrmquickTaskAccount { get; set; }

    public virtual CmpUser? CrmquickTaskAssignedUser { get; set; }

    public virtual CrmCallReview? CrmquickTaskCallReview { get; set; }

    public virtual CmpUser? CrmquickTaskCompletedByNavigation { get; set; }

    public virtual CmpUser? CrmquickTaskCreatedByNavigation { get; set; }

    public virtual OrgMaster? CrmquickTaskCustomerOrg { get; set; }

    public virtual SysCrmdecisionStatus CrmquickTaskDecisionStatusCodeNavigation { get; set; } = null!;

    public virtual JobHeader? CrmquickTaskJob { get; set; }

    public virtual CrmLead? CrmquickTaskLead { get; set; }

    public virtual CrmOpportunity? CrmquickTaskOpportunity { get; set; }

    public virtual SysWorkflowPriority CrmquickTaskPriorityCodeNavigation { get; set; } = null!;

    public virtual CrmQuoteFollowup? CrmquickTaskQuoteFollowup { get; set; }

    public virtual CrmActivityWorkflowRun? CrmquickTaskRun { get; set; }

    public virtual SysCrmquickTaskStatus CrmquickTaskStatusCodeNavigation { get; set; } = null!;

    public virtual SysCrmquickTaskType CrmquickTaskTaskTypeCodeNavigation { get; set; } = null!;

    public virtual CmpUser? CrmquickTaskUpdatedByNavigation { get; set; }

    public virtual WorkflowTask? CrmquickTaskWorkflowTask { get; set; }
}
