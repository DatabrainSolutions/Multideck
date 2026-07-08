using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinProfitShareSummary
{
    public Guid? FinpsitemPartnerOrgId { get; set; }

    public Guid? FinpsrunPeriodId { get; set; }

    public string? FinpsitemStatusCode { get; set; }

    public int? FinpsItemCount { get; set; }

    public decimal? FinpsTotalShareAmount { get; set; }
}
