using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RateJobCostingLinkSummary
{
    public Guid? RatejobCostLinkId { get; set; }

    public Guid? RatejobCostLinkRequestId { get; set; }

    public string? RaterequestCode { get; set; }

    public Guid? RatejobCostLinkResultId { get; set; }

    public Guid? RatejobCostLinkResultLineId { get; set; }

    public Guid? RatejobCostLinkJobId { get; set; }

    public int? JobNumber { get; set; }

    public Guid? RatejobCostLinkChargeInId { get; set; }

    public Guid? RatejobCostLinkChargeOutId { get; set; }

    public string? RatejobCostLinkLinkType { get; set; }

    public string? RateresultLineApplicabilityCode { get; set; }

    public string? RateresultLineChargeCodeSnapshot { get; set; }

    public decimal? RateresultLineTotalAmount { get; set; }

    public string? RateresultLineCurrencyCodeSnapshot { get; set; }

    public DateTime? RatejobCostLinkCreatedAt { get; set; }
}
