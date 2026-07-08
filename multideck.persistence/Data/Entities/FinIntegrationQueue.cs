using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinIntegrationQueue
{
    public Guid FinintQId { get; set; }

    public string FinintQLocalTable { get; set; } = null!;

    public Guid FinintQLocalId { get; set; }

    public Guid? FinintQDocumentId { get; set; }

    public Guid? FinintQPostingBatchId { get; set; }

    public Guid? FinintQExportBatchId { get; set; }

    public string FinintQStatusCode { get; set; } = null!;

    public int FinintQPriority { get; set; }

    public int FinintQAttemptCount { get; set; }

    public DateTime? FinintQLastAttemptAt { get; set; }

    public string? FinintQLastError { get; set; }

    public DateTime FinintQCreatedAt { get; set; }

    public Guid? FinintQCreatedBy { get; set; }

    public virtual CmpUser? FinintQCreatedByNavigation { get; set; }

    public virtual FinDocument? FinintQDocument { get; set; }

    public virtual AcciExportBatch? FinintQExportBatch { get; set; }

    public virtual FinPostingBatch? FinintQPostingBatch { get; set; }
}
