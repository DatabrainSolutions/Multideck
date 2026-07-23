using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RateQuoteLinkSummary
{
    public Guid? RatequoteLinkId { get; set; }

    public Guid? RatequoteLinkRequestId { get; set; }

    public string? RaterequestCode { get; set; }

    public Guid? RatequoteLinkResultId { get; set; }

    public string? RateresultStatusCode { get; set; }

    public decimal? RateresultBuyTotal { get; set; }

    public decimal? RateresultSellTotal { get; set; }

    public decimal? RateresultMarginAmount { get; set; }

    public Guid? RatequoteLinkCusQuoteRevId { get; set; }

    public Guid? RatequoteLinkCostOptId { get; set; }

    public Guid? RatequoteLinkRevenueOptId { get; set; }

    public Guid? RatequoteLinkChargeInId { get; set; }

    public Guid? RatequoteLinkChargeOutId { get; set; }

    public string? RatequoteLinkLinkType { get; set; }

    public DateTime? RatequoteLinkCreatedAt { get; set; }
}
