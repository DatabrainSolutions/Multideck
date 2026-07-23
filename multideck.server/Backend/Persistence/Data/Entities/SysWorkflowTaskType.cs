using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWorkflowTaskType
{
    public string WorkflowTaskTypeCode { get; set; } = null!;

    public string WorkflowTaskTypeName { get; set; } = null!;

    public string? WorkflowTaskTypeDescription { get; set; }

    public bool WorkflowTaskTypeIsActive { get; set; }

    public int WorkflowTaskTypeSortOrder { get; set; }

    public virtual ICollection<SysCrmnextBestActionType> SysCrmnextBestActionTypes { get; set; } = new List<SysCrmnextBestActionType>();

    public virtual ICollection<SysCrmquickTaskType> SysCrmquickTaskTypes { get; set; } = new List<SysCrmquickTaskType>();

    public virtual ICollection<WorkflowSlarule> WorkflowSlarules { get; set; } = new List<WorkflowSlarule>();

    public virtual ICollection<WorkflowStep> WorkflowSteps { get; set; } = new List<WorkflowStep>();

    public virtual ICollection<WorkflowTask> WorkflowTasks { get; set; } = new List<WorkflowTask>();
}
