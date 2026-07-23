using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RateRateSheet
{
    public Guid RatesheetId { get; set; }

    public Guid RatesheetContractVerId { get; set; }

    public string RatesheetCode { get; set; } = null!;

    public string RatesheetName { get; set; } = null!;

    public string RatesheetStatusCode { get; set; } = null!;

    public string RatesheetApplicabilityCode { get; set; } = null!;

    public string? RatesheetModeCode { get; set; }

    public string? RatesheetShipmentTypeCode { get; set; }

    public Guid? RatesheetServiceId { get; set; }

    public Guid? RatesheetLaneId { get; set; }

    public Guid? RatesheetCurrencyId { get; set; }

    public string? RatesheetCurrencyCodeSnapshot { get; set; }

    public DateOnly? RatesheetValidFrom { get; set; }

    public DateOnly? RatesheetValidTo { get; set; }

    public int RatesheetPriority { get; set; }

    public string? RatesheetNotes { get; set; }

    public string RatesheetMetadataJson { get; set; } = null!;

    public DateTime RatesheetCreatedAt { get; set; }

    public Guid? RatesheetCreatedBy { get; set; }

    public DateTime RatesheetUpdatedAt { get; set; }

    public Guid? RatesheetUpdatedBy { get; set; }

    public virtual ICollection<RateRateLine> RateRateLines { get; set; } = new List<RateRateLine>();

    public virtual ICollection<RateRateResult> RateRateResults { get; set; } = new List<RateRateResult>();

    public virtual ICollection<RateSurcharge> RateSurcharges { get; set; } = new List<RateSurcharge>();

    public virtual SysRateApplicabilityType RatesheetApplicabilityCodeNavigation { get; set; } = null!;

    public virtual RateContractVersion RatesheetContractVer { get; set; } = null!;

    public virtual CmpUser? RatesheetCreatedByNavigation { get; set; }

    public virtual SysCurrency? RatesheetCurrency { get; set; }

    public virtual RateLane? RatesheetLane { get; set; }

    public virtual SysJobTransportMode? RatesheetModeCodeNavigation { get; set; }

    public virtual RateServiceProduct? RatesheetService { get; set; }

    public virtual SysCusQuoteShipmentMode? RatesheetShipmentTypeCodeNavigation { get; set; }

    public virtual SysRateStatus RatesheetStatusCodeNavigation { get; set; } = null!;

    public virtual CmpUser? RatesheetUpdatedByNavigation { get; set; }
}
