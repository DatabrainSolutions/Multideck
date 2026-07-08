using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AuditExportEvent
{
    public Guid AuditExportId { get; set; }

    public Guid? AuditExportEventId { get; set; }

    public string AuditExportExportType { get; set; } = null!;

    public string? AuditExportRecordTypeCode { get; set; }

    public string? AuditExportSourceTableName { get; set; }

    public string? AuditExportFilterSummary { get; set; }

    public string? AuditExportQueryHash { get; set; }

    public int? AuditExportRowCount { get; set; }

    public string? AuditExportFileName { get; set; }

    public string? AuditExportFilePathHash { get; set; }

    public string? AuditExportFileHash { get; set; }

    public string? AuditExportFormat { get; set; }

    public Guid? AuditExportUserId { get; set; }

    public string? AuditExportRequestId { get; set; }

    public string? AuditExportReason { get; set; }

    public DateTime AuditExportExportedAt { get; set; }

    public string AuditExportMetadataJson { get; set; } = null!;

    public virtual AuditEvent? AuditExportEventNavigation { get; set; }

    public virtual SysWorkflowRecordType? AuditExportRecordTypeCodeNavigation { get; set; }

    public virtual CmpUser? AuditExportUser { get; set; }
}
