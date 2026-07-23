using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WorkflowStep
{
    public Guid WorkflowStepId { get; set; }

    public Guid WorkflowStepDefinitionVersionId { get; set; }

    public string WorkflowStepCode { get; set; } = null!;

    public string WorkflowStepName { get; set; } = null!;

    public string? WorkflowStepDescription { get; set; }

    public string WorkflowStepTypeCode { get; set; } = null!;

    public string? WorkflowStepTaskTypeCode { get; set; }

    public string? WorkflowStepDefaultStatusCode { get; set; }

    public string WorkflowStepDefaultPriorityCode { get; set; } = null!;

    public int WorkflowStepOrderNo { get; set; }

    public bool WorkflowStepIsRequired { get; set; }

    public bool WorkflowStepIsBlocking { get; set; }

    public bool WorkflowStepAutoStart { get; set; }

    public bool WorkflowStepAutoComplete { get; set; }

    public bool WorkflowStepAllowManualComplete { get; set; }

    public Guid? WorkflowStepDefaultQueueId { get; set; }

    public Guid? WorkflowStepDefaultAssignedUserId { get; set; }

    public Guid? WorkflowStepDefaultAssignedRoleId { get; set; }

    public int? WorkflowStepDueOffsetValue { get; set; }

    public string? WorkflowStepDueOffsetUnit { get; set; }

    public bool WorkflowStepDueBeforeTrigger { get; set; }

    public Guid? WorkflowStepSlaprofileId { get; set; }

    public string WorkflowStepConditionJson { get; set; } = null!;

    public string WorkflowStepSettingsJson { get; set; } = null!;

    public DateTime WorkflowStepCreatedAt { get; set; }

    public Guid? WorkflowStepCreatedBy { get; set; }

    public virtual ICollection<WorkflowAction> WorkflowActions { get; set; } = new List<WorkflowAction>();

    public virtual ICollection<WorkflowChecklist> WorkflowChecklists { get; set; } = new List<WorkflowChecklist>();

    public virtual ICollection<WorkflowCondition> WorkflowConditions { get; set; } = new List<WorkflowCondition>();

    public virtual ICollection<WorkflowInstance> WorkflowInstances { get; set; } = new List<WorkflowInstance>();

    public virtual CmpUser? WorkflowStepCreatedByNavigation { get; set; }

    public virtual SysUserRole? WorkflowStepDefaultAssignedRole { get; set; }

    public virtual CmpUser? WorkflowStepDefaultAssignedUser { get; set; }

    public virtual SysWorkflowPriority WorkflowStepDefaultPriorityCodeNavigation { get; set; } = null!;

    public virtual WorkflowWorkQueue? WorkflowStepDefaultQueue { get; set; }

    public virtual SysWorkflowTaskStatus? WorkflowStepDefaultStatusCodeNavigation { get; set; }

    public virtual WorkflowDefinitionVersion WorkflowStepDefinitionVersion { get; set; } = null!;

    public virtual ICollection<WorkflowStepDependency> WorkflowStepDependencyWorkflowStepDepDependsOnSteps { get; set; } = new List<WorkflowStepDependency>();

    public virtual ICollection<WorkflowStepDependency> WorkflowStepDependencyWorkflowStepDepSteps { get; set; } = new List<WorkflowStepDependency>();

    public virtual WorkflowSlaprofile? WorkflowStepSlaprofile { get; set; }

    public virtual SysWorkflowTaskType? WorkflowStepTaskTypeCodeNavigation { get; set; }

    public virtual SysWorkflowStepType WorkflowStepTypeCodeNavigation { get; set; } = null!;

    public virtual ICollection<WorkflowTask> WorkflowTasks { get; set; } = new List<WorkflowTask>();

    public virtual ICollection<WorkflowTrigger> WorkflowTriggers { get; set; } = new List<WorkflowTrigger>();
}
