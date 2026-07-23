using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RateActiveRateLineSummary
{
    public Guid? RatelineId { get; set; }

    public Guid? RatecontractId { get; set; }

    public string? RatecontractCode { get; set; }

    public string? RatecontractName { get; set; }

    public string? RatecontractTypeCode { get; set; }

    public Guid? RatecontractVerId { get; set; }

    public int? RatecontractVerVersionNo { get; set; }

    public Guid? RatesheetId { get; set; }

    public string? RatesheetCode { get; set; }

    public string? RatesheetName { get; set; }

    public string? RatesheetApplicabilityCode { get; set; }

    public string? RatesheetModeCode { get; set; }

    public string? RatesheetShipmentTypeCode { get; set; }

    public Guid? RatesheetLaneId { get; set; }

    public string? RatelaneName { get; set; }

    public int? RatelineLineNo { get; set; }

    public Guid? RatelineChargeId { get; set; }

    public string? RatechargeCode { get; set; }

    public string? RatechargeName { get; set; }

    public string? RatechargeCategoryCode { get; set; }

    public string? RatelineBasisCode { get; set; }

    public string? RatelineCalculationMethodCode { get; set; }

    public string? RatelineCurrencyCodeSnapshot { get; set; }

    public decimal? RatelineUnitRate { get; set; }

    public decimal? RatelineMinimumAmount { get; set; }

    public decimal? RatelineMaximumAmount { get; set; }

    public string? RatelineEquipmentTypeCode { get; set; }

    public DateOnly? EffectiveFrom { get; set; }

    public DateOnly? EffectiveTo { get; set; }
}
