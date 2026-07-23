using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CusQuoteCostOptionSummary
{
    public Guid? CusQuoteCostOptId { get; set; }

    public Guid? CusQuoteCostOptRevId { get; set; }

    public int? CusQuoteCostOptSubId { get; set; }

    public string? CusQuoteCostOptStatusCode { get; set; }

    public Guid? CusQuoteCostOptCarrierId { get; set; }

    public string? CusQuoteCostOptCarrierNameSnapshot { get; set; }

    public string? CusQuoteCostOptDescription { get; set; }

    public string? CusQuoteCostOptModeCode { get; set; }

    public string? CusQuoteCostOptShipmentTypeCode { get; set; }

    public int? CusQuoteCostOptTransitDays { get; set; }

    public DateTime? CusQuoteCostOptDepartureDate { get; set; }

    public DateTime? CusQuoteCostOptArrivalDate { get; set; }

    public bool? CusQuoteCostOptDirect { get; set; }

    public string? CusQuoteCostOptVia { get; set; }

    public int? CostLineCount { get; set; }

    public decimal? ExpectedCostCurrTotal { get; set; }

    public decimal? ExpectedCostLocalTotal { get; set; }
}
