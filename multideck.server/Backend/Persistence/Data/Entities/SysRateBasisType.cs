using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysRateBasisType
{
    public string RatebasCode { get; set; } = null!;

    public string RatebasName { get; set; } = null!;

    public string? RatebasDescription { get; set; }

    public string? RatebasDefaultUom { get; set; }

    public int RatebasSortOrder { get; set; }

    public virtual ICollection<RateCalculationRule> RateCalculationRules { get; set; } = new List<RateCalculationRule>();

    public virtual ICollection<RateChargeCode> RateChargeCodes { get; set; } = new List<RateChargeCode>();

    public virtual ICollection<RateRateLine> RateRateLines { get; set; } = new List<RateRateLine>();

    public virtual ICollection<RateRateResultLine> RateRateResultLines { get; set; } = new List<RateRateResultLine>();

    public virtual ICollection<RateSpotQuoteLine> RateSpotQuoteLines { get; set; } = new List<RateSpotQuoteLine>();

    public virtual ICollection<RateSurcharge> RateSurcharges { get; set; } = new List<RateSurcharge>();
}
