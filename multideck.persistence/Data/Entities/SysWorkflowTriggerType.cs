using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWorkflowTriggerType
{
    public string WorkflowTriggerTypeCode { get; set; } = null!;

    public string WorkflowTriggerTypeName { get; set; } = null!;

    public string? WorkflowTriggerTypeDescription { get; set; }

    public bool WorkflowTriggerTypeIsActive { get; set; }

    public int WorkflowTriggerTypeSortOrder { get; set; }

    public virtual ICollection<WorkflowInstance> WorkflowInstances { get; set; } = new List<WorkflowInstance>();

    public virtual ICollection<WorkflowSlarule> WorkflowSlarules { get; set; } = new List<WorkflowSlarule>();

    public virtual ICollection<WorkflowTask> WorkflowTasks { get; set; } = new List<WorkflowTask>();

    public virtual ICollection<WorkflowTrigger> WorkflowTriggers { get; set; } = new List<WorkflowTrigger>();
}
