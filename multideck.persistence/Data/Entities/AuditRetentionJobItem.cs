using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AuditRetentionJobItem
{
    public Guid AuditRetentionJobItemId { get; set; }

    public Guid AuditRetentionJobItemJobId { get; set; }

    public Guid? AuditRetentionJobItemEventId { get; set; }

    public string AuditRetentionJobItemAction { get; set; } = null!;

    public string AuditRetentionJobItemStatusCode { get; set; } = null!;

    public DateTime AuditRetentionJobItemProcessedAt { get; set; }

    public string? AuditRetentionJobItemErrorMessage { get; set; }

    public virtual AuditEvent? AuditRetentionJobItemEvent { get; set; }

    public virtual AuditRetentionJob AuditRetentionJobItemJob { get; set; } = null!;

    public virtual SysAuditOutcomeStatus AuditRetentionJobItemStatusCodeNavigation { get; set; } = null!;
}
