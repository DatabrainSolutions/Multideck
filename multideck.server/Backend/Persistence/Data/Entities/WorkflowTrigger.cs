using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WorkflowTrigger
{
    public Guid WorkflowTrigId { get; set; }

    public Guid? WorkflowTrigDefinitionVersionId { get; set; }

    public Guid? WorkflowTrigStepId { get; set; }

    public string WorkflowTrigTypeCode { get; set; } = null!;

    public string WorkflowTrigName { get; set; } = null!;

    public string? WorkflowTrigRecordTypeCode { get; set; }

    public string? WorkflowTrigEventCode { get; set; }

    public string? WorkflowTrigScheduleCron { get; set; }

    public string WorkflowTrigConditionJson { get; set; } = null!;

    public string WorkflowTrigSettingsJson { get; set; } = null!;

    public bool WorkflowTrigIsActive { get; set; }

    public DateTime WorkflowTrigCreatedAt { get; set; }

    public virtual ICollection<WorkflowAction> WorkflowActions { get; set; } = new List<WorkflowAction>();

    public virtual ICollection<WorkflowCondition> WorkflowConditions { get; set; } = new List<WorkflowCondition>();

    public virtual WorkflowDefinitionVersion? WorkflowTrigDefinitionVersion { get; set; }

    public virtual SysWorkflowRecordType? WorkflowTrigRecordTypeCodeNavigation { get; set; }

    public virtual WorkflowStep? WorkflowTrigStep { get; set; }

    public virtual SysWorkflowTriggerType WorkflowTrigTypeCodeNavigation { get; set; } = null!;
}
