using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class MigImportRun
{
    public Guid MigrunId { get; set; }

    public Guid MigrunBatchId { get; set; }

    public string MigrunStatusCode { get; set; } = null!;

    public string MigrunModeCode { get; set; } = null!;

    public DateTime? MigrunStartedAt { get; set; }

    public DateTime? MigrunFinishedAt { get; set; }

    public int MigrunInsertedCount { get; set; }

    public int MigrunUpdatedCount { get; set; }

    public int MigrunSkippedCount { get; set; }

    public int MigrunErrorCount { get; set; }

    public string MigrunResultJson { get; set; } = null!;

    public DateTime MigrunCreatedAt { get; set; }

    public Guid? MigrunCreatedBy { get; set; }

    public virtual ICollection<MigLoadResult> MigLoadResults { get; set; } = new List<MigLoadResult>();

    public virtual MigImportBatch MigrunBatch { get; set; } = null!;

    public virtual CmpUser? MigrunCreatedByNavigation { get; set; }

    public virtual SysObsrunStatus MigrunStatusCodeNavigation { get; set; } = null!;
}
