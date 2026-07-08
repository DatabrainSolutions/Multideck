using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWorkflowEscalationStatus
{
    public string WorkflowEscStatusCode { get; set; } = null!;

    public string WorkflowEscStatusName { get; set; } = null!;

    public string? WorkflowEscStatusDescription { get; set; }

    public bool WorkflowEscStatusIsOpen { get; set; }

    public bool WorkflowEscStatusIsActive { get; set; }

    public int WorkflowEscStatusSortOrder { get; set; }

    public virtual ICollection<WorkflowEscalation> WorkflowEscalations { get; set; } = new List<WorkflowEscalation>();
}
