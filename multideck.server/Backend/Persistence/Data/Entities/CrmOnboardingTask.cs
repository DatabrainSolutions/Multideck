using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmOnboardingTask
{
    public Guid CrmonboardTaskId { get; set; }

    public Guid CrmonboardTaskRunId { get; set; }

    public Guid? CrmonboardTaskMilestoneId { get; set; }

    public Guid? CrmonboardTaskWorkflowTaskId { get; set; }

    public string CrmonboardTaskTitle { get; set; } = null!;

    public string? CrmonboardTaskDescription { get; set; }

    public string CrmonboardTaskStatusCode { get; set; } = null!;

    public Guid? CrmonboardTaskAssignedUserId { get; set; }

    public DateTime? CrmonboardTaskDueAt { get; set; }

    public DateTime? CrmonboardTaskCompletedAt { get; set; }

    public Guid? CrmonboardTaskCompletedBy { get; set; }

    public string? CrmonboardTaskCustomerFacingNotes { get; set; }

    public string? CrmonboardTaskInternalNotes { get; set; }

    public DateTime CrmonboardTaskCreatedAt { get; set; }

    public virtual CmpUser? CrmonboardTaskAssignedUser { get; set; }

    public virtual CmpUser? CrmonboardTaskCompletedByNavigation { get; set; }

    public virtual CrmOnboardingMilestone? CrmonboardTaskMilestone { get; set; }

    public virtual CrmOnboardingRun CrmonboardTaskRun { get; set; } = null!;

    public virtual SysCrmonboardingStatus CrmonboardTaskStatusCodeNavigation { get; set; } = null!;

    public virtual WorkflowTask? CrmonboardTaskWorkflowTask { get; set; }
}
