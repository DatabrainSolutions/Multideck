using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWorkflowInstanceStatus
{
    public string WorkflowInstStatusCode { get; set; } = null!;

    public string WorkflowInstStatusName { get; set; } = null!;

    public string? WorkflowInstStatusDescription { get; set; }

    public bool WorkflowInstStatusIsActive { get; set; }

    public int WorkflowInstStatusSortOrder { get; set; }

    public virtual ICollection<WorkflowInstance> WorkflowInstances { get; set; } = new List<WorkflowInstance>();
}
