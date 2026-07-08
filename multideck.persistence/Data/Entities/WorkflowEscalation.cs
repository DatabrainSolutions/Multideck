using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WorkflowEscalation
{
    public Guid WorkflowEscId { get; set; }

    public Guid? WorkflowEscInstanceId { get; set; }

    public Guid? WorkflowEscTaskId { get; set; }

    public Guid? WorkflowEscApprovalId { get; set; }

    public Guid? WorkflowEscSlatimerId { get; set; }

    public string? WorkflowEscRecordTypeCode { get; set; }

    public Guid? WorkflowEscRecordId { get; set; }

    public string WorkflowEscStatusCode { get; set; } = null!;

    public string WorkflowEscSeverityCode { get; set; } = null!;

    public string WorkflowEscTitle { get; set; } = null!;

    public string? WorkflowEscDescription { get; set; }

    public DateTime WorkflowEscEscalatedAt { get; set; }

    public Guid? WorkflowEscEscalatedBy { get; set; }

    public Guid? WorkflowEscEscalatedToUserId { get; set; }

    public Guid? WorkflowEscEscalatedToRoleId { get; set; }

    public Guid? WorkflowEscEscalatedToQueueId { get; set; }

    public DateTime? WorkflowEscAcknowledgedAt { get; set; }

    public Guid? WorkflowEscAcknowledgedBy { get; set; }

    public DateTime? WorkflowEscResolvedAt { get; set; }

    public Guid? WorkflowEscResolvedBy { get; set; }

    public string? WorkflowEscResolutionNotes { get; set; }

    public string WorkflowEscContextJson { get; set; } = null!;

    public virtual CmpUser? WorkflowEscAcknowledgedByNavigation { get; set; }

    public virtual WorkflowApproval? WorkflowEscApproval { get; set; }

    public virtual CmpUser? WorkflowEscEscalatedByNavigation { get; set; }

    public virtual WorkflowWorkQueue? WorkflowEscEscalatedToQueue { get; set; }

    public virtual SysUserRole? WorkflowEscEscalatedToRole { get; set; }

    public virtual CmpUser? WorkflowEscEscalatedToUser { get; set; }

    public virtual WorkflowInstance? WorkflowEscInstance { get; set; }

    public virtual SysWorkflowRecordType? WorkflowEscRecordTypeCodeNavigation { get; set; }

    public virtual CmpUser? WorkflowEscResolvedByNavigation { get; set; }

    public virtual SysWorkflowPriority WorkflowEscSeverityCodeNavigation { get; set; } = null!;

    public virtual WorkflowSlatimer? WorkflowEscSlatimer { get; set; }

    public virtual SysWorkflowEscalationStatus WorkflowEscStatusCodeNavigation { get; set; } = null!;

    public virtual WorkflowTask? WorkflowEscTask { get; set; }

    public virtual ICollection<WorkflowEvent> WorkflowEvents { get; set; } = new List<WorkflowEvent>();
}
