using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinCommissionRun
{
    public Guid FincommRunId { get; set; }

    public Guid? FincommRunPeriodId { get; set; }

    public string FincommRunStatusCode { get; set; } = null!;

    public DateOnly FincommRunRunDate { get; set; }

    public decimal FincommRunTotalAmount { get; set; }

    public DateTime FincommRunCreatedAt { get; set; }

    public Guid? FincommRunCreatedBy { get; set; }

    public virtual ICollection<FinCommissionItem> FinCommissionItems { get; set; } = new List<FinCommissionItem>();

    public virtual CmpUser? FincommRunCreatedByNavigation { get; set; }

    public virtual FinPeriod? FincommRunPeriod { get; set; }
}
