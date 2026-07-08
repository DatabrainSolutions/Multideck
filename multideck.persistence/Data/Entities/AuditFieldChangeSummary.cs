using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AuditFieldChangeSummary
{
    public Guid? AuditFieldChangeId { get; set; }

    public Guid? AuditFieldChangeEventId { get; set; }

    public string? AuditEventSourceTableName { get; set; }

    public string? AuditEventRecordTypeCode { get; set; }

    public Guid? AuditEventRecordId { get; set; }

    public string? AuditEventRecordKeyJson { get; set; }

    public Guid? AuditEventUserId { get; set; }

    public string? AuditEventUserEmail { get; set; }

    public DateTime? AuditEventOccurredAt { get; set; }

    public string? AuditFieldChangeColumnName { get; set; }

    public string? AuditFieldChangeDataType { get; set; }

    public string? AuditFieldChangeOldValueJson { get; set; }

    public string? AuditFieldChangeNewValueJson { get; set; }

    public bool? AuditFieldChangeIsRedacted { get; set; }

    public bool? AuditFieldChangeIsSensitive { get; set; }

    public string? AuditFieldChangeSensitivityCode { get; set; }
}
