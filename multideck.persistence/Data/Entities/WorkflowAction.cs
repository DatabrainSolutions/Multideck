using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WorkflowAction
{
    public Guid WorkflowActionId { get; set; }

    public Guid? WorkflowActionDefinitionVersionId { get; set; }

    public Guid? WorkflowActionStepId { get; set; }

    public Guid? WorkflowActionTriggerId { get; set; }

    public string WorkflowActionTypeCode { get; set; } = null!;

    public string WorkflowActionName { get; set; } = null!;

    public int WorkflowActionOrderNo { get; set; }

    public string? WorkflowActionRunOnStatusCode { get; set; }

    public string WorkflowActionConfigJson { get; set; } = null!;

    public bool WorkflowActionIsAsync { get; set; }

    public bool WorkflowActionIsActive { get; set; }

    public DateTime WorkflowActionCreatedAt { get; set; }

    public virtual WorkflowDefinitionVersion? WorkflowActionDefinitionVersion { get; set; }

    public virtual WorkflowStep? WorkflowActionStep { get; set; }

    public virtual WorkflowTrigger? WorkflowActionTrigger { get; set; }

    public virtual SysWorkflowActionType WorkflowActionTypeCodeNavigation { get; set; } = null!;

    public virtual ICollection<WorkflowAutomationRun> WorkflowAutomationRuns { get; set; } = new List<WorkflowAutomationRun>();

    public virtual ICollection<WorkflowCondition> WorkflowConditions { get; set; } = new List<WorkflowCondition>();
}
