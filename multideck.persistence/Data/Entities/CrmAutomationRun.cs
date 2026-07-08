using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmAutomationRun
{
    public Guid CrmautoRunId { get; set; }

    public Guid CrmautoRunPlaybookId { get; set; }

    public string CrmautoRunStatusCode { get; set; } = null!;

    public Guid? CrmautoRunQuickTaskId { get; set; }

    public Guid? CrmautoRunWorkflowTaskId { get; set; }

    public Guid? CrmautoRunActivityId { get; set; }

    public Guid? CrmautoRunAccountId { get; set; }

    public Guid? CrmautoRunLeadId { get; set; }

    public Guid? CrmautoRunOpportunityId { get; set; }

    public Guid? CrmautoRunQuoteFollowupId { get; set; }

    public Guid? CrmautoRunCallReviewId { get; set; }

    public Guid? CrmautoRunJobId { get; set; }

    public Guid? CrmautoRunCustomerOrgId { get; set; }

    public string CrmautoRunTargetTable { get; set; } = null!;

    public string CrmautoRunTargetPkcolumn { get; set; } = null!;

    public Guid CrmautoRunTargetId { get; set; }

    public Guid? CrmautoRunAssignedUserId { get; set; }

    public Guid? CrmautoRunAitaskRunId { get; set; }

    public string CrmautoRunContextJson { get; set; } = null!;

    public DateTime CrmautoRunStartedAt { get; set; }

    public Guid? CrmautoRunStartedBy { get; set; }

    public DateTime? CrmautoRunCompletedAt { get; set; }

    public Guid? CrmautoRunCompletedBy { get; set; }

    public string? CrmautoRunErrorMessage { get; set; }

    public virtual ICollection<CrmAutomationRunStep> CrmAutomationRunSteps { get; set; } = new List<CrmAutomationRunStep>();

    public virtual ICollection<CrmDataCaptureSession> CrmDataCaptureSessions { get; set; } = new List<CrmDataCaptureSession>();

    public virtual ICollection<CrmDataRequest> CrmDataRequests { get; set; } = new List<CrmDataRequest>();

    public virtual ICollection<CrmFieldUpdateQueue> CrmFieldUpdateQueues { get; set; } = new List<CrmFieldUpdateQueue>();

    public virtual CrmAccountProfile? CrmautoRunAccount { get; set; }

    public virtual CrmActivity? CrmautoRunActivity { get; set; }

    public virtual AiTaskRun? CrmautoRunAitaskRun { get; set; }

    public virtual CmpUser? CrmautoRunAssignedUser { get; set; }

    public virtual CrmCallReview? CrmautoRunCallReview { get; set; }

    public virtual CmpUser? CrmautoRunCompletedByNavigation { get; set; }

    public virtual OrgMaster? CrmautoRunCustomerOrg { get; set; }

    public virtual JobHeader? CrmautoRunJob { get; set; }

    public virtual CrmLead? CrmautoRunLead { get; set; }

    public virtual CrmOpportunity? CrmautoRunOpportunity { get; set; }

    public virtual CrmAutomationPlaybook CrmautoRunPlaybook { get; set; } = null!;

    public virtual CrmQuickTask? CrmautoRunQuickTask { get; set; }

    public virtual CrmQuoteFollowup? CrmautoRunQuoteFollowup { get; set; }

    public virtual CmpUser? CrmautoRunStartedByNavigation { get; set; }

    public virtual SysCrmautomationRunStatus CrmautoRunStatusCodeNavigation { get; set; } = null!;

    public virtual WorkflowTask? CrmautoRunWorkflowTask { get; set; }
}
