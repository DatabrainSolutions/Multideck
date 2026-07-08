using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceAuditEvent
{
    public Guid TceauditId { get; set; }

    public string TceauditEventTypeCode { get; set; } = null!;

    public string? TceauditRecordTypeCode { get; set; }

    public Guid? TceauditRecordId { get; set; }

    public Guid? TceauditJobId { get; set; }

    public Guid? TceauditUserId { get; set; }

    public DateTime TceauditEventAt { get; set; }

    public string? TceauditSummary { get; set; }

    public string TceauditMetadataJson { get; set; } = null!;

    public virtual JobHeader? TceauditJob { get; set; }

    public virtual SysWorkflowRecordType? TceauditRecordTypeCodeNavigation { get; set; }

    public virtual CmpUser? TceauditUser { get; set; }
}
