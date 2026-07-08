using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWorkflowDefinitionStatus
{
    public string WorkflowDefStatusCode { get; set; } = null!;

    public string WorkflowDefStatusName { get; set; } = null!;

    public string? WorkflowDefStatusDescription { get; set; }

    public bool WorkflowDefStatusIsActive { get; set; }

    public int WorkflowDefStatusSortOrder { get; set; }

    public virtual ICollection<WorkflowDefinition> WorkflowDefinitions { get; set; } = new List<WorkflowDefinition>();
}
