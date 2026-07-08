using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CusQuoteRevisionSummary
{
    public Guid? CusQuoteHeaderId { get; set; }

    public int? CusQuoteHeaderNumber { get; set; }

    public Guid? CusQuoteRevId { get; set; }

    public int? CusQuoteRevNumber { get; set; }

    public string? CusQuoteRevDisplayNumber { get; set; }

    public Guid? CusQuoteRevBasedOnRevId { get; set; }

    public string? CusQuoteRevLabel { get; set; }

    public string? CusQuoteRevStatusCode { get; set; }

    public string? CusQuoteRevModeCode { get; set; }

    public string? CusQuoteRevShipmentTypeCode { get; set; }

    public string? CusQuoteRevServiceLevel { get; set; }

    public string? CusQuoteRevCarrierSummarySnapshot { get; set; }

    public int? CusQuoteRevTransitDays { get; set; }

    public DateOnly? CusQuoteRevValidFrom { get; set; }

    public DateOnly? CusQuoteRevValidTo { get; set; }

    public bool? CusQuoteRevIsAccepted { get; set; }

    public Guid? CusQuoteRevAcceptedCostOptId { get; set; }

    public Guid? CusQuoteRevAcceptedRevenueOptId { get; set; }

    public Guid? CusQuoteRevAcceptedCostRevenueLinkId { get; set; }

    public int? CostOptionCount { get; set; }

    public int? RevenueOptionCount { get; set; }

    public int? CostRevenuePairCount { get; set; }

    public decimal? ExpectedCostLocalTotal { get; set; }

    public decimal? RevenueLocalTotal { get; set; }
}
