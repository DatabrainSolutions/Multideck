using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RateQuoteLink
{
    public Guid RatequoteLinkId { get; set; }

    public Guid? RatequoteLinkRequestId { get; set; }

    public Guid RatequoteLinkResultId { get; set; }

    public Guid? RatequoteLinkResultLineId { get; set; }

    public Guid? RatequoteLinkCusQuoteRevId { get; set; }

    public Guid? RatequoteLinkCostOptId { get; set; }

    public Guid? RatequoteLinkRevenueOptId { get; set; }

    public Guid? RatequoteLinkChargeInId { get; set; }

    public Guid? RatequoteLinkChargeOutId { get; set; }

    public string RatequoteLinkLinkType { get; set; } = null!;

    public DateTime RatequoteLinkCreatedAt { get; set; }

    public Guid? RatequoteLinkCreatedBy { get; set; }

    public virtual CusQuoteChargesIn? RatequoteLinkChargeIn { get; set; }

    public virtual CusQuoteChargesOut? RatequoteLinkChargeOut { get; set; }

    public virtual CusQuoteCostOption? RatequoteLinkCostOpt { get; set; }

    public virtual CmpUser? RatequoteLinkCreatedByNavigation { get; set; }

    public virtual CusQuoteRevision? RatequoteLinkCusQuoteRev { get; set; }

    public virtual RateRateRequest? RatequoteLinkRequest { get; set; }

    public virtual RateRateResult RatequoteLinkResult { get; set; } = null!;

    public virtual RateRateResultLine? RatequoteLinkResultLine { get; set; }

    public virtual CusQuoteRevenueOption? RatequoteLinkRevenueOpt { get; set; }
}
