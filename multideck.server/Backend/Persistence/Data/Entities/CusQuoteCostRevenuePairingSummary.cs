using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CusQuoteCostRevenuePairingSummary
{
    public Guid? CqcrlId { get; set; }

    public Guid? CqcrlCusQuoteRevId { get; set; }

    public Guid? CqcrlCostOptId { get; set; }

    public Guid? CqcrlRevenueOptId { get; set; }

    public string? CqcrlStatusCode { get; set; }

    public bool? CqcrlIsPreferred { get; set; }

    public bool? CqcrlIsAccepted { get; set; }

    public int? CqcrlSortOrder { get; set; }

    public int? CusQuoteCostOptSubId { get; set; }

    public Guid? CusQuoteCostOptCarrierId { get; set; }

    public string? CusQuoteCostOptCarrierNameSnapshot { get; set; }

    public string? CostOptionDescription { get; set; }

    public string? CusQuoteCostOptModeCode { get; set; }

    public string? CusQuoteCostOptShipmentTypeCode { get; set; }

    public int? CusQuoteCostOptTransitDays { get; set; }

    public decimal? ExpectedCostCurrTotal { get; set; }

    public decimal? ExpectedCostLocalTotal { get; set; }

    public int? CusQuoteRevenueOptSubId { get; set; }

    public string? RevenueOptionDescription { get; set; }

    public string? CusQuoteRevenueOptCustomerLabel { get; set; }

    public decimal? RevenueCurrTotal { get; set; }

    public decimal? RevenueLocalTotal { get; set; }

    public decimal? ExpectedMarginLocal { get; set; }

    public decimal? ExpectedMarginPercent { get; set; }
}
