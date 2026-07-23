using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysRateStatus
{
    public string RatestCode { get; set; } = null!;

    public string RatestName { get; set; } = null!;

    public string? RatestDescription { get; set; }

    public bool RatestIsFinal { get; set; }

    public int RatestSortOrder { get; set; }

    public virtual ICollection<RateContractVersion> RateContractVersions { get; set; } = new List<RateContractVersion>();

    public virtual ICollection<RateContract> RateContracts { get; set; } = new List<RateContract>();

    public virtual ICollection<RateMarginProfile> RateMarginProfiles { get; set; } = new List<RateMarginProfile>();

    public virtual ICollection<RateRateLine> RateRateLines { get; set; } = new List<RateRateLine>();

    public virtual ICollection<RateRateSheet> RateRateSheets { get; set; } = new List<RateRateSheet>();

    public virtual ICollection<RateRuleSet> RateRuleSets { get; set; } = new List<RateRuleSet>();

    public virtual ICollection<RateSpotQuote> RateSpotQuotes { get; set; } = new List<RateSpotQuote>();

    public virtual ICollection<RateSurcharge> RateSurcharges { get; set; } = new List<RateSurcharge>();
}
