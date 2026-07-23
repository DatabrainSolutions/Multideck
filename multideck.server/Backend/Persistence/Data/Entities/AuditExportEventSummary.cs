using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AuditExportEventSummary
{
    public Guid? AuditExportId { get; set; }

    public Guid? AuditExportEventId { get; set; }

    public string? AuditExportExportType { get; set; }

    public string? AuditExportRecordTypeCode { get; set; }

    public string? AuditExportSourceTableName { get; set; }

    public int? AuditExportRowCount { get; set; }

    public string? AuditExportFileName { get; set; }

    public string? AuditExportFormat { get; set; }

    public Guid? AuditExportUserId { get; set; }

    public string? AuditExportUserEmail { get; set; }

    public string? AuditExportRequestId { get; set; }

    public string? AuditExportReason { get; set; }

    public DateTime? AuditExportExportedAt { get; set; }

    public string? AuditExportMetadataJson { get; set; }
}
