using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmOpportunityLine
{
    public Guid CrmopptyLineId { get; set; }

    public Guid CrmopptyLineOpportunityId { get; set; }

    public string? CrmopptyLineServiceCode { get; set; }

    public string? CrmopptyLineModeCode { get; set; }

    public string? CrmopptyLineShipmentTypeCode { get; set; }

    public string? CrmopptyLineTradeLane { get; set; }

    public string? CrmopptyLineFrequency { get; set; }

    public int? CrmopptyLineEstimatedShipments { get; set; }

    public decimal? CrmopptyLineEstimatedVolume { get; set; }

    public decimal? CrmopptyLineEstimatedRevenueAmount { get; set; }

    public decimal? CrmopptyLineEstimatedCostAmount { get; set; }

    public decimal? CrmopptyLineEstimatedMarginAmount { get; set; }

    public string? CrmopptyLineCurrencyCode { get; set; }

    public string? CrmopptyLineNotes { get; set; }

    public DateTime CrmopptyLineCreatedAt { get; set; }

    public virtual CrmOpportunity CrmopptyLineOpportunity { get; set; } = null!;
}
