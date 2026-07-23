using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WorkflowStepDependency
{
    public Guid WorkflowStepDepId { get; set; }

    public Guid WorkflowStepDepStepId { get; set; }

    public Guid WorkflowStepDepDependsOnStepId { get; set; }

    public string WorkflowStepDepDependencyType { get; set; } = null!;

    public bool WorkflowStepDepIsBlocking { get; set; }

    public string WorkflowStepDepConditionJson { get; set; } = null!;

    public virtual WorkflowStep WorkflowStepDepDependsOnStep { get; set; } = null!;

    public virtual WorkflowStep WorkflowStepDepStep { get; set; } = null!;
}
