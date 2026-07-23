using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WorkflowSlapause
{
    public Guid WorkflowSlapauseId { get; set; }

    public Guid WorkflowSlapauseTimerId { get; set; }

    public string WorkflowSlapauseReasonCode { get; set; } = null!;

    public DateTime WorkflowSlapauseStartedAt { get; set; }

    public Guid? WorkflowSlapauseStartedBy { get; set; }

    public DateTime? WorkflowSlapauseEndedAt { get; set; }

    public Guid? WorkflowSlapauseEndedBy { get; set; }

    public string? WorkflowSlapauseNotes { get; set; }

    public string WorkflowSlapauseContextJson { get; set; } = null!;

    public virtual CmpUser? WorkflowSlapauseEndedByNavigation { get; set; }

    public virtual SysWorkflowPauseReason WorkflowSlapauseReasonCodeNavigation { get; set; } = null!;

    public virtual CmpUser? WorkflowSlapauseStartedByNavigation { get; set; }

    public virtual WorkflowSlatimer WorkflowSlapauseTimer { get; set; } = null!;
}
