using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinCommissionAccrualSummary
{
    public Guid? FincommItemUserId { get; set; }

    public Guid? FincommRunPeriodId { get; set; }

    public string? FincommItemStatusCode { get; set; }

    public int? FincommItemCount { get; set; }

    public decimal? FincommTotalCommissionAmount { get; set; }
}
