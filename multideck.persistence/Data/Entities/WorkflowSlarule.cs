using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WorkflowSlarule
{
    public Guid WorkflowSlaruleId { get; set; }

    public Guid WorkflowSlaruleProfileId { get; set; }

    public string WorkflowSlaruleCode { get; set; } = null!;

    public string WorkflowSlaruleName { get; set; } = null!;

    public string? WorkflowSlaruleRecordTypeCode { get; set; }

    public string? WorkflowSlaruleTaskTypeCode { get; set; }

    public string? WorkflowSlaruleTriggerTypeCode { get; set; }

    public int WorkflowSlaruleTargetDurationValue { get; set; }

    public string WorkflowSlaruleTargetDurationUnit { get; set; } = null!;

    public int? WorkflowSlaruleWarningDurationValue { get; set; }

    public string? WorkflowSlaruleWarningDurationUnit { get; set; }

    public bool WorkflowSlaruleUseBusinessCalendar { get; set; }

    public string? WorkflowSlaruleCalendarCode { get; set; }

    public bool WorkflowSlarulePauseAllowed { get; set; }

    public bool WorkflowSlaruleEscalateOnWarning { get; set; }

    public bool WorkflowSlaruleEscalateOnBreach { get; set; }

    public string WorkflowSlaruleConditionJson { get; set; } = null!;

    public string WorkflowSlaruleSettingsJson { get; set; } = null!;

    public bool WorkflowSlaruleIsActive { get; set; }

    public DateTime WorkflowSlaruleCreatedAt { get; set; }

    public virtual WorkflowSlaprofile WorkflowSlaruleProfile { get; set; } = null!;

    public virtual SysWorkflowRecordType? WorkflowSlaruleRecordTypeCodeNavigation { get; set; }

    public virtual SysWorkflowTaskType? WorkflowSlaruleTaskTypeCodeNavigation { get; set; }

    public virtual SysWorkflowTriggerType? WorkflowSlaruleTriggerTypeCodeNavigation { get; set; }

    public virtual ICollection<WorkflowSlatimer> WorkflowSlatimers { get; set; } = new List<WorkflowSlatimer>();
}
