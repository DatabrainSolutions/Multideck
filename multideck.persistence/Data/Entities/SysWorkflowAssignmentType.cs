using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWorkflowAssignmentType
{
    public string WorkflowAssignmentTypeCode { get; set; } = null!;

    public string WorkflowAssignmentTypeName { get; set; } = null!;

    public string? WorkflowAssignmentTypeDescription { get; set; }

    public bool WorkflowAssignmentTypeIsActive { get; set; }

    public int WorkflowAssignmentTypeSortOrder { get; set; }

    public virtual ICollection<WorkflowTaskAssignment> WorkflowTaskAssignments { get; set; } = new List<WorkflowTaskAssignment>();
}
