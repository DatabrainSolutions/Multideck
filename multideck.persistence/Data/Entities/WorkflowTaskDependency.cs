using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WorkflowTaskDependency
{
    public Guid WorkflowTaskDepId { get; set; }

    public Guid WorkflowTaskDepTaskId { get; set; }

    public Guid WorkflowTaskDepDependsOnTaskId { get; set; }

    public string WorkflowTaskDepDependencyType { get; set; } = null!;

    public bool WorkflowTaskDepIsBlocking { get; set; }

    public DateTime WorkflowTaskDepCreatedAt { get; set; }

    public virtual WorkflowTask WorkflowTaskDepDependsOnTask { get; set; } = null!;

    public virtual WorkflowTask WorkflowTaskDepTask { get; set; } = null!;
}
