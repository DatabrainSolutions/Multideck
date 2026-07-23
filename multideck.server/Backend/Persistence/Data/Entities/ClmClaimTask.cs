using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ClmClaimTask
{
    public Guid ClmtaskId { get; set; }

    public Guid? ClmtaskClaimId { get; set; }

    public Guid? ClmtaskIncidentId { get; set; }

    public string ClmtaskTaskTypeCode { get; set; } = null!;

    public string ClmtaskTitle { get; set; } = null!;

    public string? ClmtaskDescription { get; set; }

    public string ClmtaskStatusCode { get; set; } = null!;

    public string ClmtaskPriorityCode { get; set; } = null!;

    public Guid? ClmtaskWorkflowTaskId { get; set; }

    public Guid? ClmtaskAssignedUserId { get; set; }

    public DateTime? ClmtaskDueAt { get; set; }

    public DateTime? ClmtaskCompletedAt { get; set; }

    public Guid? ClmtaskCompletedBy { get; set; }

    public DateTime ClmtaskCreatedAt { get; set; }

    public Guid? ClmtaskCreatedBy { get; set; }

    public virtual CmpUser? ClmtaskAssignedUser { get; set; }

    public virtual ClmClaim? ClmtaskClaim { get; set; }

    public virtual CmpUser? ClmtaskCompletedByNavigation { get; set; }

    public virtual CmpUser? ClmtaskCreatedByNavigation { get; set; }

    public virtual ClmIncident? ClmtaskIncident { get; set; }

    public virtual SysWorkflowPriority ClmtaskPriorityCodeNavigation { get; set; } = null!;

    public virtual SysWorkflowTaskStatus ClmtaskStatusCodeNavigation { get; set; } = null!;

    public virtual SysClmtaskType ClmtaskTaskTypeCodeNavigation { get; set; } = null!;

    public virtual WorkflowTask? ClmtaskWorkflowTask { get; set; }
}
