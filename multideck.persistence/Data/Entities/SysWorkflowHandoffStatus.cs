using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWorkflowHandoffStatus
{
    public string WorkflowHandoffStatusCode { get; set; } = null!;

    public string WorkflowHandoffStatusName { get; set; } = null!;

    public string? WorkflowHandoffStatusDescription { get; set; }

    public bool WorkflowHandoffStatusIsOpen { get; set; }

    public bool WorkflowHandoffStatusIsActive { get; set; }

    public int WorkflowHandoffStatusSortOrder { get; set; }

    public virtual ICollection<WorkflowHandoff> WorkflowHandoffs { get; set; } = new List<WorkflowHandoff>();
}
