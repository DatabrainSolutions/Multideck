using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CusQuoteRevenueOptionSummary
{
    public Guid? CusQuoteRevenueOptId { get; set; }

    public Guid? CusQuoteRevId { get; set; }

    public int? CusQuoteRevenueOptSubId { get; set; }

    public string? CusQuoteRevenueOptStatusCode { get; set; }

    public string? CusQuoteRevenueOptDescription { get; set; }

    public string? CusQuoteRevenueOptCustomerLabel { get; set; }

    public bool? CusQuoteRevenueOptIsPreferred { get; set; }

    public bool? CusQuoteRevenueOptIsAccepted { get; set; }

    public int? RevenueLineCount { get; set; }

    public decimal? RevenueCurrTotal { get; set; }

    public decimal? RevenueLocalTotal { get; set; }

    public int? LinkedCostOptionCount { get; set; }

    public int? CostRevenuePairCount { get; set; }
}
