using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinRoeworklist
{
    public Guid? FinchargeRoeId { get; set; }

    public string? FinchargeRoeSourceTable { get; set; }

    public Guid? FinchargeRoeSourceId { get; set; }

    public Guid? FinchargeRoeJobId { get; set; }

    public string? FinchargeRoeFromCurrencyCode { get; set; }

    public string? FinchargeRoeToCurrencyCode { get; set; }

    public string? FinchargeRoeRoetypeCode { get; set; }

    public DateOnly? FinchargeRoeRateDate { get; set; }

    public decimal? FinchargeRoeRate { get; set; }

    public bool? FinchargeRoeIsStale { get; set; }

    public bool? FinchargeRoeMissingProviderRate { get; set; }
}
