using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysJobTransportMode
{
    public string JtmCode { get; set; } = null!;

    public string JtmName { get; set; } = null!;

    public string? JtmCustomsTransportModeCode { get; set; }

    public string? JtmDescription { get; set; }

    public int JtmSortOrder { get; set; }

    public bool JtmIsActive { get; set; }

    public DateTime JtmCreatedAt { get; set; }

    public virtual ICollection<JobHeader> JobHeaders { get; set; } = new List<JobHeader>();

    public virtual ICollection<JobRouting> JobRoutings { get; set; } = new List<JobRouting>();

    public virtual SysCustomsTransportMode? JtmCustomsTransportModeCodeNavigation { get; set; }

    public virtual ICollection<RateLane> RateLanes { get; set; } = new List<RateLane>();

    public virtual ICollection<RateMarginProfile> RateMarginProfiles { get; set; } = new List<RateMarginProfile>();

    public virtual ICollection<RateRateRequest> RateRateRequests { get; set; } = new List<RateRateRequest>();

    public virtual ICollection<RateRateSheet> RateRateSheets { get; set; } = new List<RateRateSheet>();

    public virtual ICollection<RateRuleSet> RateRuleSets { get; set; } = new List<RateRuleSet>();

    public virtual ICollection<RateServiceProduct> RateServiceProducts { get; set; } = new List<RateServiceProduct>();

    public virtual ICollection<RateSpotQuote> RateSpotQuotes { get; set; } = new List<RateSpotQuote>();

    public virtual ICollection<RateTariffAssignment> RateTariffAssignments { get; set; } = new List<RateTariffAssignment>();

    public virtual ICollection<SysCusQuoteShipmentMode> SysCusQuoteShipmentModes { get; set; } = new List<SysCusQuoteShipmentMode>();
}
