using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WorkflowCondition
{
    public Guid WorkflowCondId { get; set; }

    public Guid? WorkflowCondDefinitionVersionId { get; set; }

    public Guid? WorkflowCondStepId { get; set; }

    public Guid? WorkflowCondTriggerId { get; set; }

    public Guid? WorkflowCondActionId { get; set; }

    public string WorkflowCondName { get; set; } = null!;

    public int WorkflowCondOrderNo { get; set; }

    public string WorkflowCondRuleJson { get; set; } = null!;

    public bool WorkflowCondIsRequired { get; set; }

    public bool WorkflowCondIsActive { get; set; }

    public DateTime WorkflowCondCreatedAt { get; set; }

    public virtual WorkflowAction? WorkflowCondAction { get; set; }

    public virtual WorkflowDefinitionVersion? WorkflowCondDefinitionVersion { get; set; }

    public virtual WorkflowStep? WorkflowCondStep { get; set; }

    public virtual WorkflowTrigger? WorkflowCondTrigger { get; set; }
}
