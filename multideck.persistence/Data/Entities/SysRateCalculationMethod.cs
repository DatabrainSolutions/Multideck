using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysRateCalculationMethod
{
    public string RatecalcCode { get; set; } = null!;

    public string RatecalcName { get; set; } = null!;

    public string? RatecalcDescription { get; set; }

    public bool RatecalcUsesBreaks { get; set; }

    public int RatecalcSortOrder { get; set; }

    public virtual ICollection<RateCalculationRule> RateCalculationRules { get; set; } = new List<RateCalculationRule>();

    public virtual ICollection<RateRateLine> RateRateLines { get; set; } = new List<RateRateLine>();

    public virtual ICollection<RateSurcharge> RateSurcharges { get; set; } = new List<RateSurcharge>();
}
