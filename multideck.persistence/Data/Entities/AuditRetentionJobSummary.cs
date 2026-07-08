using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AuditRetentionJobSummary
{
    public Guid? AuditRetentionJobId { get; set; }

    public string? AuditRetentionJobStatusCode { get; set; }

    public string? AuditRetentionJobRetentionClassCode { get; set; }

    public DateTime? AuditRetentionJobCutoffAt { get; set; }

    public string? AuditRetentionJobAction { get; set; }

    public DateTime? AuditRetentionJobStartedAt { get; set; }

    public DateTime? AuditRetentionJobCompletedAt { get; set; }

    public int? AuditRetentionJobProcessedCount { get; set; }

    public int? AuditRetentionJobArchivedCount { get; set; }

    public int? AuditRetentionJobDeletedCount { get; set; }

    public int? AuditRetentionJobItemCount { get; set; }

    public string? AuditRetentionJobErrorMessage { get; set; }

    public DateTime? AuditRetentionJobCreatedAt { get; set; }
}
