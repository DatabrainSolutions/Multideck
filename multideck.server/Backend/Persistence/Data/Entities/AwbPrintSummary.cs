using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AwbPrintSummary
{
    public Guid? AwbId { get; set; }

    public Guid? AwbJobId { get; set; }

    public string? AwbNumber { get; set; }

    public string? AwbAwbtype { get; set; }

    public string? AwbStatus { get; set; }

    public DateOnly? AwbDocumentDate { get; set; }

    public DateTime? AwbIssueDateTime { get; set; }

    public bool? AwbEAwbindicator { get; set; }

    public string? AwbEawbcode { get; set; }

    public string? AwbOriginAirportCodeSnapshot { get; set; }

    public string? AwbDestinationAirportCodeSnapshot { get; set; }

    public string? AwbCarrierNameSnapshot { get; set; }

    public string? AwbShipperNameSnapshot { get; set; }

    public string? AwbConsigneeNameSnapshot { get; set; }

    public long? AwbTotalPieces { get; set; }

    public decimal? AwbTotalGrossWeight { get; set; }

    public decimal? AwbTotalChargeableWeight { get; set; }

    public string? AwbGrossWeightUom { get; set; }

    public string? AwbChargeableWeightUom { get; set; }

    public string? AwbChargeCurrencyCodeSnapshot { get; set; }

    public decimal? AwbTotalChargeAmount { get; set; }
}
