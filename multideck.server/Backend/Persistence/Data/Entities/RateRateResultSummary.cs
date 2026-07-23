using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RateRateResultSummary
{
    public Guid? RateresultId { get; set; }

    public Guid? RateresultRequestId { get; set; }

    public string? RaterequestCode { get; set; }

    public string? RateresultStatusCode { get; set; }

    public string? RateresultSourceTypeCode { get; set; }

    public Guid? RateresultContractId { get; set; }

    public string? RatecontractCode { get; set; }

    public string? RatecontractName { get; set; }

    public Guid? RateresultCarrierOrgId { get; set; }

    public string? RateresultCarrierOrgName { get; set; }

    public string? RateresultCarrierNameSnapshot { get; set; }

    public string? RateresultServiceLevel { get; set; }

    public int? RateresultTransitDays { get; set; }

    public bool? RateresultDirect { get; set; }

    public string? RateresultCurrencyCodeSnapshot { get; set; }

    public decimal? RateresultBuyTotal { get; set; }

    public decimal? RateresultSellTotal { get; set; }

    public decimal? RateresultMarginAmount { get; set; }

    public decimal? RateresultMarginPercent { get; set; }

    public long? RateresultLineCount { get; set; }

    public decimal? RateresultBuyLineTotal { get; set; }

    public decimal? RateresultSellLineTotal { get; set; }

    public DateTime? RateresultCreatedAt { get; set; }
}
