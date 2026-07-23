using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AuditAccessEvent
{
    public Guid AuditAccessId { get; set; }

    public Guid? AuditAccessEventId { get; set; }

    public string AuditAccessAccessTypeCode { get; set; } = null!;

    public string? AuditAccessRecordTypeCode { get; set; }

    public Guid? AuditAccessRecordId { get; set; }

    public string AuditAccessRecordKeyJson { get; set; } = null!;

    public string? AuditAccessSourceTableName { get; set; }

    public Guid? AuditAccessDocumentId { get; set; }

    public string? AuditAccessFilePathHash { get; set; }

    public Guid? AuditAccessUserId { get; set; }

    public Guid? AuditAccessAuthUserId { get; set; }

    public string? AuditAccessRequestId { get; set; }

    public string? AuditAccessSessionId { get; set; }

    public string? AuditAccessReason { get; set; }

    public bool AuditAccessWasAllowed { get; set; }

    public string? AuditAccessDeniedReason { get; set; }

    public DateTime AuditAccessAccessedAt { get; set; }

    public string AuditAccessMetadataJson { get; set; } = null!;

    public virtual SysAuditAccessType AuditAccessAccessTypeCodeNavigation { get; set; } = null!;

    public virtual AuditEvent? AuditAccessEventNavigation { get; set; }

    public virtual SysWorkflowRecordType? AuditAccessRecordTypeCodeNavigation { get; set; }

    public virtual CmpUser? AuditAccessUser { get; set; }
}
