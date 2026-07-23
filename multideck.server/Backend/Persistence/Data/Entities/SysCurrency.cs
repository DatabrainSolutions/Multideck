using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCurrency
{
    public Guid CurrencyId { get; set; }

    public string? CurrencyCode { get; set; }

    public string? CurrencySymbol { get; set; }

    public string? CurrencyName { get; set; }

    public string? CurrencyUnitName { get; set; }

    public string? CurrencySubUnitName { get; set; }

    public int? CurrencySubUnitRatio { get; set; }

    public virtual ICollection<RateContract> RateContracts { get; set; } = new List<RateContract>();

    public virtual ICollection<RateMarginRule> RateMarginRules { get; set; } = new List<RateMarginRule>();

    public virtual ICollection<RateRateLine> RateRateLines { get; set; } = new List<RateRateLine>();

    public virtual ICollection<RateRateRequest> RateRateRequests { get; set; } = new List<RateRateRequest>();

    public virtual ICollection<RateRateResultLine> RateRateResultLines { get; set; } = new List<RateRateResultLine>();

    public virtual ICollection<RateRateResult> RateRateResults { get; set; } = new List<RateRateResult>();

    public virtual ICollection<RateRateSheet> RateRateSheets { get; set; } = new List<RateRateSheet>();

    public virtual ICollection<RateResultAdjustment> RateResultAdjustments { get; set; } = new List<RateResultAdjustment>();

    public virtual ICollection<RateSpotQuoteLine> RateSpotQuoteLines { get; set; } = new List<RateSpotQuoteLine>();

    public virtual ICollection<RateSurcharge> RateSurcharges { get; set; } = new List<RateSurcharge>();
}
