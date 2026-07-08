using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWorkflowPauseReason
{
    public string WorkflowPauseReasonCode { get; set; } = null!;

    public string WorkflowPauseReasonName { get; set; } = null!;

    public string? WorkflowPauseReasonDescription { get; set; }

    public bool WorkflowPauseReasonIsActive { get; set; }

    public int WorkflowPauseReasonSortOrder { get; set; }

    public virtual ICollection<WorkflowSlapause> WorkflowSlapauses { get; set; } = new List<WorkflowSlapause>();
}
