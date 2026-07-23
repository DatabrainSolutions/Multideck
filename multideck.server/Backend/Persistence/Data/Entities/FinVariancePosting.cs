using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinVariancePosting
{
    public Guid FinvarPostId { get; set; }

    public Guid FinvarPostCaseId { get; set; }

    public Guid? FinvarPostPostingBatchId { get; set; }

    public string FinvarPostPostingTypeCode { get; set; } = null!;

    public decimal FinvarPostAmount { get; set; }

    public decimal FinvarPostLocalAmount { get; set; }

    public DateTime? FinvarPostPostedAt { get; set; }

    public string? FinvarPostNotes { get; set; }

    public virtual FinVarianceCase FinvarPostCase { get; set; } = null!;
}
