using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AuditRetentionJob
{
    public Guid AuditRetentionJobId { get; set; }

    public string AuditRetentionJobStatusCode { get; set; } = null!;

    public string? AuditRetentionJobRetentionClassCode { get; set; }

    public DateTime AuditRetentionJobCutoffAt { get; set; }

    public string AuditRetentionJobAction { get; set; } = null!;

    public DateTime? AuditRetentionJobStartedAt { get; set; }

    public DateTime? AuditRetentionJobCompletedAt { get; set; }

    public int AuditRetentionJobProcessedCount { get; set; }

    public int AuditRetentionJobArchivedCount { get; set; }

    public int AuditRetentionJobDeletedCount { get; set; }

    public string? AuditRetentionJobErrorMessage { get; set; }

    public DateTime AuditRetentionJobCreatedAt { get; set; }

    public Guid? AuditRetentionJobCreatedBy { get; set; }

    public string AuditRetentionJobMetadataJson { get; set; } = null!;

    public virtual CmpUser? AuditRetentionJobCreatedByNavigation { get; set; }

    public virtual ICollection<AuditRetentionJobItem> AuditRetentionJobItems { get; set; } = new List<AuditRetentionJobItem>();

    public virtual SysAuditRetentionClass? AuditRetentionJobRetentionClassCodeNavigation { get; set; }

    public virtual SysAuditOutcomeStatus AuditRetentionJobStatusCodeNavigation { get; set; } = null!;
}
