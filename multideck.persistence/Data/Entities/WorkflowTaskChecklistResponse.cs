using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WorkflowTaskChecklistResponse
{
    public Guid WorkflowTaskChecklistRespId { get; set; }

    public Guid WorkflowTaskChecklistRespTaskId { get; set; }

    public Guid WorkflowTaskChecklistRespChecklistItemId { get; set; }

    public string WorkflowTaskChecklistRespResponseValueJson { get; set; } = null!;

    public string? WorkflowTaskChecklistRespResponseText { get; set; }

    public bool? WorkflowTaskChecklistRespIsPassed { get; set; }

    public DateTime? WorkflowTaskChecklistRespCompletedAt { get; set; }

    public Guid? WorkflowTaskChecklistRespCompletedBy { get; set; }

    public string? WorkflowTaskChecklistRespNotes { get; set; }

    public DateTime WorkflowTaskChecklistRespCreatedAt { get; set; }

    public DateTime WorkflowTaskChecklistRespUpdatedAt { get; set; }

    public virtual WorkflowChecklistItem WorkflowTaskChecklistRespChecklistItem { get; set; } = null!;

    public virtual CmpUser? WorkflowTaskChecklistRespCompletedByNavigation { get; set; }

    public virtual WorkflowTask WorkflowTaskChecklistRespTask { get; set; } = null!;
}
