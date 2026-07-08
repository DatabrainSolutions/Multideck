using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWorkflowActionType
{
    public string WorkflowActionTypeCode { get; set; } = null!;

    public string WorkflowActionTypeName { get; set; } = null!;

    public string? WorkflowActionTypeDescription { get; set; }

    public bool WorkflowActionTypeIsActive { get; set; }

    public int WorkflowActionTypeSortOrder { get; set; }

    public virtual ICollection<WorkflowAction> WorkflowActions { get; set; } = new List<WorkflowAction>();

    public virtual ICollection<WorkflowAutomationRun> WorkflowAutomationRuns { get; set; } = new List<WorkflowAutomationRun>();
}
