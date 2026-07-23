using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class MigImportRow
{
    public Guid MigrowId { get; set; }

    public Guid MigrowBatchId { get; set; }

    public Guid? MigrowFileId { get; set; }

    public int MigrowRowNumber { get; set; }

    public string MigrowStatusCode { get; set; } = null!;

    public string? MigrowSourceKey { get; set; }

    public string MigrowSourceJson { get; set; } = null!;

    public string MigrowMappedJson { get; set; } = null!;

    public string? MigrowTargetTable { get; set; }

    public Guid? MigrowTargetId { get; set; }

    public int MigrowErrorCount { get; set; }

    public int MigrowWarningCount { get; set; }

    public DateTime MigrowCreatedAt { get; set; }

    public virtual ICollection<MigLoadResult> MigLoadResults { get; set; } = new List<MigLoadResult>();

    public virtual ICollection<MigValidationIssue> MigValidationIssues { get; set; } = new List<MigValidationIssue>();

    public virtual MigImportBatch MigrowBatch { get; set; } = null!;

    public virtual MigImportFile? MigrowFile { get; set; }

    public virtual SysMigrowStatus MigrowStatusCodeNavigation { get; set; } = null!;
}
