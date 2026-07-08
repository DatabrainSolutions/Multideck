using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class MigReconciliationSummary
{
    public Guid MigreconId { get; set; }

    public Guid MigreconBatchId { get; set; }

    public string MigreconTargetTable { get; set; } = null!;

    public int MigreconSourceCount { get; set; }

    public int MigreconLoadedCount { get; set; }

    public int MigreconExceptionCount { get; set; }

    public decimal? MigreconTotalSourceAmount { get; set; }

    public decimal? MigreconTotalLoadedAmount { get; set; }

    public DateTime MigreconReconciledAt { get; set; }

    public string? MigreconNotes { get; set; }

    public virtual MigImportBatch MigreconBatch { get; set; } = null!;
}
