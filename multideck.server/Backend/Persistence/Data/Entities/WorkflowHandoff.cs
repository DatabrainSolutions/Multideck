using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WorkflowHandoff
{
    public Guid WorkflowHandoffId { get; set; }

    public Guid? WorkflowHandoffInstanceId { get; set; }

    public Guid? WorkflowHandoffTaskId { get; set; }

    public string? WorkflowHandoffRecordTypeCode { get; set; }

    public Guid? WorkflowHandoffRecordId { get; set; }

    public string WorkflowHandoffStatusCode { get; set; } = null!;

    public string WorkflowHandoffTitle { get; set; } = null!;

    public string? WorkflowHandoffNotes { get; set; }

    public Guid? WorkflowHandoffFromUserId { get; set; }

    public Guid? WorkflowHandoffFromQueueId { get; set; }

    public Guid? WorkflowHandoffFromOrgOfficeId { get; set; }

    public Guid? WorkflowHandoffToUserId { get; set; }

    public Guid? WorkflowHandoffToQueueId { get; set; }

    public Guid? WorkflowHandoffToOrgOfficeId { get; set; }

    public int WorkflowHandoffOpenTaskCount { get; set; }

    public string WorkflowHandoffRiskJson { get; set; } = null!;

    public DateTime? WorkflowHandoffSentAt { get; set; }

    public Guid? WorkflowHandoffSentBy { get; set; }

    public DateTime? WorkflowHandoffAcceptedAt { get; set; }

    public Guid? WorkflowHandoffAcceptedBy { get; set; }

    public DateTime? WorkflowHandoffRejectedAt { get; set; }

    public Guid? WorkflowHandoffRejectedBy { get; set; }

    public string? WorkflowHandoffRejectionReason { get; set; }

    public DateTime WorkflowHandoffCreatedAt { get; set; }

    public Guid? WorkflowHandoffCreatedBy { get; set; }

    public virtual ICollection<WorkflowEvent> WorkflowEvents { get; set; } = new List<WorkflowEvent>();

    public virtual CmpUser? WorkflowHandoffAcceptedByNavigation { get; set; }

    public virtual CmpUser? WorkflowHandoffCreatedByNavigation { get; set; }

    public virtual CmpOffice? WorkflowHandoffFromOrgOffice { get; set; }

    public virtual WorkflowWorkQueue? WorkflowHandoffFromQueue { get; set; }

    public virtual CmpUser? WorkflowHandoffFromUser { get; set; }

    public virtual WorkflowInstance? WorkflowHandoffInstance { get; set; }

    public virtual SysWorkflowRecordType? WorkflowHandoffRecordTypeCodeNavigation { get; set; }

    public virtual CmpUser? WorkflowHandoffRejectedByNavigation { get; set; }

    public virtual CmpUser? WorkflowHandoffSentByNavigation { get; set; }

    public virtual SysWorkflowHandoffStatus WorkflowHandoffStatusCodeNavigation { get; set; } = null!;

    public virtual WorkflowTask? WorkflowHandoffTask { get; set; }

    public virtual CmpOffice? WorkflowHandoffToOrgOffice { get; set; }

    public virtual WorkflowWorkQueue? WorkflowHandoffToQueue { get; set; }

    public virtual CmpUser? WorkflowHandoffToUser { get; set; }
}
