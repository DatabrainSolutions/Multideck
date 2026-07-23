using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AuditEventSummary
{
    public Guid? AuditEventId { get; set; }

    public string? AuditEventEventTypeCode { get; set; }

    public string? AuditEventTypeName { get; set; }

    public string? AuditEventOutcomeStatusCode { get; set; }

    public string? AuditEventActorTypeCode { get; set; }

    public Guid? AuditEventUserId { get; set; }

    public string? AuditEventUserEmail { get; set; }

    public string? AuditEventSourceApp { get; set; }

    public string? AuditEventSourceModule { get; set; }

    public string? AuditEventSourceTableName { get; set; }

    public string? AuditEventRecordTypeCode { get; set; }

    public Guid? AuditEventRecordId { get; set; }

    public string? AuditEventRecordKeyJson { get; set; }

    public string? AuditEventAction { get; set; }

    public string? AuditEventTitle { get; set; }

    public DateTime? AuditEventOccurredAt { get; set; }

    public int? AuditEventChangedFieldCount { get; set; }

    public bool? AuditEventHasFieldChanges { get; set; }

    public bool? AuditEventHasRowSnapshot { get; set; }

    public bool? AuditEventIsSensitive { get; set; }

    public string? AuditEventSensitivityCode { get; set; }

    public string? AuditEventRetentionClassCode { get; set; }

    public string? AuditEventRequestId { get; set; }

    public string? AuditEventCorrelationId { get; set; }
}
