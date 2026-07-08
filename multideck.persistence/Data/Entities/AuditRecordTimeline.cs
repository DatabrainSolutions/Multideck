using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AuditRecordTimeline
{
    public string? AuditEventSourceTableName { get; set; }

    public string? AuditEventRecordTypeCode { get; set; }

    public Guid? AuditEventRecordId { get; set; }

    public string? AuditEventRecordKeyJson { get; set; }

    public Guid? AuditEventId { get; set; }

    public string? AuditEventEventTypeCode { get; set; }

    public string? AuditEventAction { get; set; }

    public string? AuditEventTitle { get; set; }

    public Guid? AuditEventUserId { get; set; }

    public string? AuditEventUserEmail { get; set; }

    public DateTime? AuditEventOccurredAt { get; set; }

    public int? AuditEventChangedFieldCount { get; set; }

    public string? AuditEventReason { get; set; }

    public string? AuditEventMetadataJson { get; set; }

    public string? AuditEventRequestId { get; set; }

    public string? AuditEventCorrelationId { get; set; }
}
