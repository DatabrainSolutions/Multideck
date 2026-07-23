using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WorkflowSlabreach
{
    public Guid WorkflowSlabreachId { get; set; }

    public Guid WorkflowSlabreachTimerId { get; set; }

    public DateTime WorkflowSlabreachBreachedAt { get; set; }

    public string WorkflowSlabreachSeverityCode { get; set; } = null!;

    public string? WorkflowSlabreachReason { get; set; }

    public DateTime? WorkflowSlabreachResolvedAt { get; set; }

    public Guid? WorkflowSlabreachResolvedBy { get; set; }

    public string? WorkflowSlabreachResolutionNotes { get; set; }

    public string WorkflowSlabreachContextJson { get; set; } = null!;

    public virtual CmpUser? WorkflowSlabreachResolvedByNavigation { get; set; }

    public virtual SysWorkflowPriority WorkflowSlabreachSeverityCodeNavigation { get; set; } = null!;

    public virtual WorkflowSlatimer WorkflowSlabreachTimer { get; set; } = null!;
}
