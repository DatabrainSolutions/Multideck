using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWorkflowStepType
{
    public string WorkflowStepTypeCode { get; set; } = null!;

    public string WorkflowStepTypeName { get; set; } = null!;

    public string? WorkflowStepTypeDescription { get; set; }

    public bool WorkflowStepTypeIsActive { get; set; }

    public int WorkflowStepTypeSortOrder { get; set; }

    public virtual ICollection<WorkflowStep> WorkflowSteps { get; set; } = new List<WorkflowStep>();
}
