using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WorkflowSlatimer
{
    public Guid WorkflowSlatimerId { get; set; }

    public Guid? WorkflowSlatimerProfileId { get; set; }

    public Guid? WorkflowSlatimerRuleId { get; set; }

    public Guid? WorkflowSlatimerInstanceId { get; set; }

    public Guid? WorkflowSlatimerTaskId { get; set; }

    public Guid? WorkflowSlatimerApprovalId { get; set; }

    public string? WorkflowSlatimerRecordTypeCode { get; set; }

    public Guid? WorkflowSlatimerRecordId { get; set; }

    public string WorkflowSlatimerStatusCode { get; set; } = null!;

    public DateTime WorkflowSlatimerStartAt { get; set; }

    public DateTime? WorkflowSlatimerWarningAt { get; set; }

    public DateTime WorkflowSlatimerDueAt { get; set; }

    public DateTime? WorkflowSlatimerCompletedAt { get; set; }

    public DateTime? WorkflowSlatimerBreachedAt { get; set; }

    public DateTime? WorkflowSlatimerPausedAt { get; set; }

    public int WorkflowSlatimerPausedSeconds { get; set; }

    public string WorkflowSlatimerTimeZone { get; set; } = null!;

    public string? WorkflowSlatimerCalendarCode { get; set; }

    public string? WorkflowSlatimerBreachReason { get; set; }

    public string WorkflowSlatimerContextJson { get; set; } = null!;

    public DateTime WorkflowSlatimerCreatedAt { get; set; }

    public Guid? WorkflowSlatimerCreatedBy { get; set; }

    public virtual ICollection<WorkflowEscalation> WorkflowEscalations { get; set; } = new List<WorkflowEscalation>();

    public virtual ICollection<WorkflowEvent> WorkflowEvents { get; set; } = new List<WorkflowEvent>();

    public virtual ICollection<WorkflowSlabreach> WorkflowSlabreaches { get; set; } = new List<WorkflowSlabreach>();

    public virtual ICollection<WorkflowSlaevent> WorkflowSlaevents { get; set; } = new List<WorkflowSlaevent>();

    public virtual ICollection<WorkflowSlapause> WorkflowSlapauses { get; set; } = new List<WorkflowSlapause>();

    public virtual WorkflowApproval? WorkflowSlatimerApproval { get; set; }

    public virtual CmpUser? WorkflowSlatimerCreatedByNavigation { get; set; }

    public virtual WorkflowInstance? WorkflowSlatimerInstance { get; set; }

    public virtual WorkflowSlaprofile? WorkflowSlatimerProfile { get; set; }

    public virtual SysWorkflowRecordType? WorkflowSlatimerRecordTypeCodeNavigation { get; set; }

    public virtual WorkflowSlarule? WorkflowSlatimerRule { get; set; }

    public virtual SysWorkflowSlastatus WorkflowSlatimerStatusCodeNavigation { get; set; } = null!;

    public virtual WorkflowTask? WorkflowSlatimerTask { get; set; }
}
