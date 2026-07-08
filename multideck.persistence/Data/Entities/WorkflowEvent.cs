using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WorkflowEvent
{
    public Guid WorkflowEventId { get; set; }

    public Guid? WorkflowEventInstanceId { get; set; }

    public Guid? WorkflowEventTaskId { get; set; }

    public Guid? WorkflowEventApprovalId { get; set; }

    public Guid? WorkflowEventSlatimerId { get; set; }

    public Guid? WorkflowEventEscalationId { get; set; }

    public Guid? WorkflowEventHandoffId { get; set; }

    public string WorkflowEventEventTypeCode { get; set; } = null!;

    public string? WorkflowEventRecordTypeCode { get; set; }

    public Guid? WorkflowEventRecordId { get; set; }

    public string? WorkflowEventTitle { get; set; }

    public string? WorkflowEventNotes { get; set; }

    public string? WorkflowEventOldStatusCode { get; set; }

    public string? WorkflowEventNewStatusCode { get; set; }

    public string WorkflowEventEventJson { get; set; } = null!;

    public DateTime WorkflowEventEventAt { get; set; }

    public Guid? WorkflowEventEventBy { get; set; }

    public string WorkflowEventSource { get; set; } = null!;

    public virtual ICollection<AuditEvent> AuditEvents { get; set; } = new List<AuditEvent>();

    public virtual WorkflowApproval? WorkflowEventApproval { get; set; }

    public virtual WorkflowEscalation? WorkflowEventEscalation { get; set; }

    public virtual CmpUser? WorkflowEventEventByNavigation { get; set; }

    public virtual SysWorkflowEventType WorkflowEventEventTypeCodeNavigation { get; set; } = null!;

    public virtual WorkflowHandoff? WorkflowEventHandoff { get; set; }

    public virtual WorkflowInstance? WorkflowEventInstance { get; set; }

    public virtual SysWorkflowRecordType? WorkflowEventRecordTypeCodeNavigation { get; set; }

    public virtual WorkflowSlatimer? WorkflowEventSlatimer { get; set; }

    public virtual WorkflowTask? WorkflowEventTask { get; set; }
}
