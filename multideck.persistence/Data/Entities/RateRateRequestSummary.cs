using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RateRateRequestSummary
{
    public Guid? RaterequestId { get; set; }

    public string? RaterequestCode { get; set; }

    public string? RaterequestStatusCode { get; set; }

    public string? RaterequestSourceTypeCode { get; set; }

    public Guid? RaterequestCustomerOrgId { get; set; }

    public string? RaterequestCustomerName { get; set; }

    public Guid? RaterequestCarrierOrgId { get; set; }

    public string? RaterequestCarrierName { get; set; }

    public Guid? RaterequestJobId { get; set; }

    public int? RaterequestJobNumber { get; set; }

    public Guid? RaterequestCusQuoteRevId { get; set; }

    public string? RaterequestModeCode { get; set; }

    public string? RaterequestShipmentTypeCode { get; set; }

    public string? RaterequestDirectionCode { get; set; }

    public string? RaterequestOriginUnlocode { get; set; }

    public string? RaterequestDestinationUnlocode { get; set; }

    public string? RaterequestCurrencyCodeSnapshot { get; set; }

    public long? RaterequestCargoLineCount { get; set; }

    public long? RaterequestEquipmentLineCount { get; set; }

    public long? RaterequestResultCount { get; set; }

    public decimal? RaterequestMinBuyTotal { get; set; }

    public decimal? RaterequestMinSellTotal { get; set; }

    public DateTime? RaterequestCreatedAt { get; set; }
}
