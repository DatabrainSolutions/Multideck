using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RateRateLine
{
    public Guid RatelineId { get; set; }

    public Guid RatelineSheetId { get; set; }

    public int RatelineLineNo { get; set; }

    public Guid RatelineChargeId { get; set; }

    public string RatelineChargeCodeSnapshot { get; set; } = null!;

    public string? RatelineDescription { get; set; }

    public string RatelineStatusCode { get; set; } = null!;

    public string RatelineBasisCode { get; set; } = null!;

    public string RatelineCalculationMethodCode { get; set; } = null!;

    public Guid? RatelineCurrencyId { get; set; }

    public string? RatelineCurrencyCodeSnapshot { get; set; }

    public decimal? RatelineUnitRate { get; set; }

    public decimal? RatelineMinimumAmount { get; set; }

    public decimal? RatelineMaximumAmount { get; set; }

    public decimal? RatelineQuantityIncluded { get; set; }

    public int? RatelineFreeTimeDays { get; set; }

    public string? RatelineEquipmentTypeCode { get; set; }

    public string? RatelineCommodityCode { get; set; }

    public string? RatelineHscodePrefix { get; set; }

    public bool RatelineDangerousGoodsOnly { get; set; }

    public bool RatelineTemperatureControlledOnly { get; set; }

    public bool? RatelineStackableRequired { get; set; }

    public DateOnly? RatelineValidFrom { get; set; }

    public DateOnly? RatelineValidTo { get; set; }

    public string RatelineRuleJson { get; set; } = null!;

    public DateTime RatelineCreatedAt { get; set; }

    public Guid? RatelineCreatedBy { get; set; }

    public DateTime RatelineUpdatedAt { get; set; }

    public Guid? RatelineUpdatedBy { get; set; }

    public virtual ICollection<CusQuoteChargesIn> CusQuoteChargesIns { get; set; } = new List<CusQuoteChargesIn>();

    public virtual ICollection<CusQuoteChargesOut> CusQuoteChargesOuts { get; set; } = new List<CusQuoteChargesOut>();

    public virtual ICollection<JobCostingChargesIn> JobCostingChargesIns { get; set; } = new List<JobCostingChargesIn>();

    public virtual ICollection<JobCostingChargesOut> JobCostingChargesOuts { get; set; } = new List<JobCostingChargesOut>();

    public virtual ICollection<RateRateBreak> RateRateBreaks { get; set; } = new List<RateRateBreak>();

    public virtual ICollection<RateRateResultLine> RateRateResultLines { get; set; } = new List<RateRateResultLine>();

    public virtual SysRateBasisType RatelineBasisCodeNavigation { get; set; } = null!;

    public virtual SysRateCalculationMethod RatelineCalculationMethodCodeNavigation { get; set; } = null!;

    public virtual RateChargeCode RatelineCharge { get; set; } = null!;

    public virtual CmpUser? RatelineCreatedByNavigation { get; set; }

    public virtual SysCurrency? RatelineCurrency { get; set; }

    public virtual RateRateSheet RatelineSheet { get; set; } = null!;

    public virtual SysRateStatus RatelineStatusCodeNavigation { get; set; } = null!;

    public virtual CmpUser? RatelineUpdatedByNavigation { get; set; }
}
