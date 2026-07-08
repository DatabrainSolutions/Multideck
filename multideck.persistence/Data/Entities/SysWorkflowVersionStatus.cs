using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWorkflowVersionStatus
{
    public string WorkflowVerStatusCode { get; set; } = null!;

    public string WorkflowVerStatusName { get; set; } = null!;

    public string? WorkflowVerStatusDescription { get; set; }

    public bool WorkflowVerStatusIsActive { get; set; }

    public int WorkflowVerStatusSortOrder { get; set; }

    public virtual ICollection<WorkflowDefinitionVersion> WorkflowDefinitionVersions { get; set; } = new List<WorkflowDefinitionVersion>();
}
