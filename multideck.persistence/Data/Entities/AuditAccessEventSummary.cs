using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AuditAccessEventSummary
{
    public Guid? AuditAccessId { get; set; }

    public Guid? AuditAccessEventId { get; set; }

    public string? AuditAccessAccessTypeCode { get; set; }

    public string? AuditAccessRecordTypeCode { get; set; }

    public Guid? AuditAccessRecordId { get; set; }

    public string? AuditAccessSourceTableName { get; set; }

    public Guid? AuditAccessDocumentId { get; set; }

    public Guid? AuditAccessUserId { get; set; }

    public string? AuditAccessUserEmail { get; set; }

    public string? AuditAccessRequestId { get; set; }

    public bool? AuditAccessWasAllowed { get; set; }

    public string? AuditAccessDeniedReason { get; set; }

    public DateTime? AuditAccessAccessedAt { get; set; }

    public string? AuditAccessMetadataJson { get; set; }
}
