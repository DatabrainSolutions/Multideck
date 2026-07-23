using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class MigImportBatchSummary
{
    public Guid? BatchId { get; set; }

    public string? BatchCode { get; set; }

    public string? BatchName { get; set; }

    public string? EntityTypeCode { get; set; }

    public string? StatusCode { get; set; }

    public int? RowCount { get; set; }

    public int? ValidRowCount { get; set; }

    public int? ErrorRowCount { get; set; }

    public long? OpenIssueCount { get; set; }

    public long? BlockingIssueCount { get; set; }

    public DateTime? CreatedAt { get; set; }
}
