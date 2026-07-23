using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWorkflowTaskStatus
{
    public string WorkflowTaskStatusCode { get; set; } = null!;

    public string WorkflowTaskStatusName { get; set; } = null!;

    public string? WorkflowTaskStatusDescription { get; set; }

    public bool WorkflowTaskStatusIsOpen { get; set; }

    public bool WorkflowTaskStatusIsActive { get; set; }

    public int WorkflowTaskStatusSortOrder { get; set; }

    public virtual ICollection<ClmClaimTask> ClmClaimTasks { get; set; } = new List<ClmClaimTask>();

    public virtual ICollection<ClmIncidentAction> ClmIncidentActions { get; set; } = new List<ClmIncidentAction>();

    public virtual ICollection<WorkflowAutomationRun> WorkflowAutomationRuns { get; set; } = new List<WorkflowAutomationRun>();

    public virtual ICollection<WorkflowStep> WorkflowSteps { get; set; } = new List<WorkflowStep>();

    public virtual ICollection<WorkflowTask> WorkflowTasks { get; set; } = new List<WorkflowTask>();
}
