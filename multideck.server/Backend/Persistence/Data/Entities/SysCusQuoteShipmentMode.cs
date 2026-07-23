using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCusQuoteShipmentMode
{
    public string CqsmCode { get; set; } = null!;

    public string CqsmName { get; set; } = null!;

    public string? CqsmJobTransportModeCode { get; set; }

    public string? CqsmDescription { get; set; }

    public int CqsmSortOrder { get; set; }

    public bool CqsmIsActive { get; set; }

    public DateTime CqsmCreatedAt { get; set; }

    public virtual SysJobTransportMode? CqsmJobTransportModeCodeNavigation { get; set; }

    public virtual ICollection<CusQuoteCostOption> CusQuoteCostOptions { get; set; } = new List<CusQuoteCostOption>();

    public virtual ICollection<CusQuoteRevision> CusQuoteRevisions { get; set; } = new List<CusQuoteRevision>();

    public virtual ICollection<RateRateRequest> RateRateRequests { get; set; } = new List<RateRateRequest>();

    public virtual ICollection<RateRateSheet> RateRateSheets { get; set; } = new List<RateRateSheet>();

    public virtual ICollection<RateRuleSet> RateRuleSets { get; set; } = new List<RateRuleSet>();

    public virtual ICollection<RateServiceProduct> RateServiceProducts { get; set; } = new List<RateServiceProduct>();

    public virtual ICollection<RateSpotQuote> RateSpotQuotes { get; set; } = new List<RateSpotQuote>();
}
