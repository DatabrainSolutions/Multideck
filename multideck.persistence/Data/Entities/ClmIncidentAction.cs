using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ClmIncidentAction
{
    public Guid ClmincActionId { get; set; }

    public Guid ClmincActionIncidentId { get; set; }

    public string ClmincActionTaskTypeCode { get; set; } = null!;

    public string ClmincActionTitle { get; set; } = null!;

    public string? ClmincActionDescription { get; set; }

    public string ClmincActionStatusCode { get; set; } = null!;

    public Guid? ClmincActionWorkflowTaskId { get; set; }

    public Guid? ClmincActionAssignedUserId { get; set; }

    public DateTime? ClmincActionDueAt { get; set; }

    public DateTime? ClmincActionCompletedAt { get; set; }

    public Guid? ClmincActionCompletedBy { get; set; }

    public DateTime ClmincActionCreatedAt { get; set; }

    public Guid? ClmincActionCreatedBy { get; set; }

    public virtual CmpUser? ClmincActionAssignedUser { get; set; }

    public virtual CmpUser? ClmincActionCompletedByNavigation { get; set; }

    public virtual CmpUser? ClmincActionCreatedByNavigation { get; set; }

    public virtual ClmIncident ClmincActionIncident { get; set; } = null!;

    public virtual SysWorkflowTaskStatus ClmincActionStatusCodeNavigation { get; set; } = null!;

    public virtual SysClmtaskType ClmincActionTaskTypeCodeNavigation { get; set; } = null!;

    public virtual WorkflowTask? ClmincActionWorkflowTask { get; set; }
}
