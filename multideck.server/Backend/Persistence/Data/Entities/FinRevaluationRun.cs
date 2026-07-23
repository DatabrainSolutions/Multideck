using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinRevaluationRun
{
    public Guid FinrevalId { get; set; }

    public Guid? FinrevalPeriodId { get; set; }

    public string FinrevalStatusCode { get; set; } = null!;

    public DateOnly FinrevalRevaluationDate { get; set; }

    public string FinrevalBaseCurrencyCode { get; set; } = null!;

    public decimal FinrevalTotalGainLossAmount { get; set; }

    public DateTime FinrevalStartedAt { get; set; }

    public Guid? FinrevalStartedBy { get; set; }

    public DateTime? FinrevalCompletedAt { get; set; }

    public virtual ICollection<FinRevaluationItem> FinRevaluationItems { get; set; } = new List<FinRevaluationItem>();

    public virtual FinPeriod? FinrevalPeriod { get; set; }

    public virtual CmpUser? FinrevalStartedByNavigation { get; set; }
}
