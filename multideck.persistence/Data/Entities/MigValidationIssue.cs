using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class MigValidationIssue
{
    public Guid MigissueId { get; set; }

    public Guid MigissueBatchId { get; set; }

    public Guid? MigissueRowId { get; set; }

    public string MigissueSeverityCode { get; set; } = null!;

    public string? MigissueFieldName { get; set; }

    public string MigissueIssueCode { get; set; } = null!;

    public string MigissueMessage { get; set; } = null!;

    public string MigissueSuggestedFixJson { get; set; } = null!;

    public bool MigissueIsResolved { get; set; }

    public Guid? MigissueResolvedBy { get; set; }

    public DateTime? MigissueResolvedAt { get; set; }

    public DateTime MigissueCreatedAt { get; set; }

    public virtual MigImportBatch MigissueBatch { get; set; } = null!;

    public virtual CmpUser? MigissueResolvedByNavigation { get; set; }

    public virtual MigImportRow? MigissueRow { get; set; }

    public virtual SysMigissueSeverity MigissueSeverityCodeNavigation { get; set; } = null!;
}
