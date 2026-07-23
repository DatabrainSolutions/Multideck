using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinProfitShareRun
{
    public Guid FinpsrunId { get; set; }

    public Guid? FinpsrunPeriodId { get; set; }

    public string FinpsrunStatusCode { get; set; } = null!;

    public DateOnly FinpsrunRunDate { get; set; }

    public decimal FinpsrunTotalAmount { get; set; }

    public DateTime FinpsrunCreatedAt { get; set; }

    public Guid? FinpsrunCreatedBy { get; set; }

    public virtual ICollection<FinProfitShareItem> FinProfitShareItems { get; set; } = new List<FinProfitShareItem>();

    public virtual CmpUser? FinpsrunCreatedByNavigation { get; set; }

    public virtual FinPeriod? FinpsrunPeriod { get; set; }
}
