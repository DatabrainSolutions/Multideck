using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WorkflowDefinitionVersion
{
    public Guid WorkflowDefVerId { get; set; }

    public Guid WorkflowDefVerDefinitionId { get; set; }

    public int WorkflowDefVerVersionNo { get; set; }

    public string WorkflowDefVerStatusCode { get; set; } = null!;

    public string? WorkflowDefVerName { get; set; }

    public string? WorkflowDefVerChangeSummary { get; set; }

    public string WorkflowDefVerDefinitionJson { get; set; } = null!;

    public DateTime? WorkflowDefVerValidFrom { get; set; }

    public DateTime? WorkflowDefVerValidTo { get; set; }

    public DateTime? WorkflowDefVerPublishedAt { get; set; }

    public Guid? WorkflowDefVerPublishedBy { get; set; }

    public DateTime WorkflowDefVerCreatedAt { get; set; }

    public Guid? WorkflowDefVerCreatedBy { get; set; }

    public DateTime WorkflowDefVerUpdatedAt { get; set; }

    public Guid? WorkflowDefVerUpdatedBy { get; set; }

    public virtual ICollection<WorkflowAction> WorkflowActions { get; set; } = new List<WorkflowAction>();

    public virtual ICollection<WorkflowChecklist> WorkflowChecklists { get; set; } = new List<WorkflowChecklist>();

    public virtual ICollection<WorkflowCondition> WorkflowConditions { get; set; } = new List<WorkflowCondition>();

    public virtual CmpUser? WorkflowDefVerCreatedByNavigation { get; set; }

    public virtual WorkflowDefinition WorkflowDefVerDefinition { get; set; } = null!;

    public virtual CmpUser? WorkflowDefVerPublishedByNavigation { get; set; }

    public virtual SysWorkflowVersionStatus WorkflowDefVerStatusCodeNavigation { get; set; } = null!;

    public virtual CmpUser? WorkflowDefVerUpdatedByNavigation { get; set; }

    public virtual ICollection<WorkflowDefinition> WorkflowDefinitions { get; set; } = new List<WorkflowDefinition>();

    public virtual ICollection<WorkflowInstance> WorkflowInstances { get; set; } = new List<WorkflowInstance>();

    public virtual ICollection<WorkflowLegacyLink> WorkflowLegacyLinks { get; set; } = new List<WorkflowLegacyLink>();

    public virtual ICollection<WorkflowStep> WorkflowSteps { get; set; } = new List<WorkflowStep>();

    public virtual ICollection<WorkflowTrigger> WorkflowTriggers { get; set; } = new List<WorkflowTrigger>();
}
