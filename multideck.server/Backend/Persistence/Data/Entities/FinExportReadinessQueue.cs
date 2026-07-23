using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinExportReadinessQueue
{
    public Guid? FinintQId { get; set; }

    public string? FinintQLocalTable { get; set; }

    public Guid? FinintQLocalId { get; set; }

    public Guid? FinintQDocumentId { get; set; }

    public Guid? FinintQPostingBatchId { get; set; }

    public string? FinintQStatusCode { get; set; }

    public int? FinintQPriority { get; set; }

    public int? FinintQAttemptCount { get; set; }

    public string? FinintQLastError { get; set; }

    public DateTime? FinintQCreatedAt { get; set; }
}
