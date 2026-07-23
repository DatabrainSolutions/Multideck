using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWorkflowPriority
{
    public string WorkflowPriorityCode { get; set; } = null!;

    public string WorkflowPriorityName { get; set; } = null!;

    public string? WorkflowPriorityDescription { get; set; }

    public int WorkflowPriorityWeight { get; set; }

    public bool WorkflowPriorityIsActive { get; set; }

    public int WorkflowPrioritySortOrder { get; set; }

    public virtual ICollection<ClmClaimTask> ClmClaimTasks { get; set; } = new List<ClmClaimTask>();

    public virtual ICollection<CrmQuickTask> CrmQuickTasks { get; set; } = new List<CrmQuickTask>();

    public virtual ICollection<SysCrmquickTaskType> SysCrmquickTaskTypes { get; set; } = new List<SysCrmquickTaskType>();

    public virtual ICollection<WorkflowApproval> WorkflowApprovals { get; set; } = new List<WorkflowApproval>();

    public virtual ICollection<WorkflowEscalation> WorkflowEscalations { get; set; } = new List<WorkflowEscalation>();

    public virtual ICollection<WorkflowInstance> WorkflowInstances { get; set; } = new List<WorkflowInstance>();

    public virtual ICollection<WorkflowSlabreach> WorkflowSlabreaches { get; set; } = new List<WorkflowSlabreach>();

    public virtual ICollection<WorkflowStep> WorkflowSteps { get; set; } = new List<WorkflowStep>();

    public virtual ICollection<WorkflowTask> WorkflowTasks { get; set; } = new List<WorkflowTask>();

    public virtual ICollection<WorkflowWorkQueue> WorkflowWorkQueues { get; set; } = new List<WorkflowWorkQueue>();
}
