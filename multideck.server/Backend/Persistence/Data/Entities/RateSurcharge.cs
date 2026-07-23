using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RateSurcharge
{
    public Guid RatesurchargeId { get; set; }

    public Guid RatesurchargeSheetId { get; set; }

    public Guid RatesurchargeChargeId { get; set; }

    public string RatesurchargeCode { get; set; } = null!;

    public string RatesurchargeName { get; set; } = null!;

    public string RatesurchargeStatusCode { get; set; } = null!;

    public string RatesurchargeBasisCode { get; set; } = null!;

    public string RatesurchargeCalculationMethodCode { get; set; } = null!;

    public Guid? RatesurchargeCurrencyId { get; set; }

    public string? RatesurchargeCurrencyCodeSnapshot { get; set; }

    public decimal? RatesurchargeAmount { get; set; }

    public decimal? RatesurchargePercent { get; set; }

    public decimal? RatesurchargeMinimumAmount { get; set; }

    public decimal? RatesurchargeMaximumAmount { get; set; }

    public DateOnly? RatesurchargeValidFrom { get; set; }

    public DateOnly? RatesurchargeValidTo { get; set; }

    public string RatesurchargeRuleJson { get; set; } = null!;

    public DateTime RatesurchargeCreatedAt { get; set; }

    public Guid? RatesurchargeCreatedBy { get; set; }

    public virtual ICollection<RateRateResultLine> RateRateResultLines { get; set; } = new List<RateRateResultLine>();

    public virtual SysRateBasisType RatesurchargeBasisCodeNavigation { get; set; } = null!;

    public virtual SysRateCalculationMethod RatesurchargeCalculationMethodCodeNavigation { get; set; } = null!;

    public virtual RateChargeCode RatesurchargeCharge { get; set; } = null!;

    public virtual CmpUser? RatesurchargeCreatedByNavigation { get; set; }

    public virtual SysCurrency? RatesurchargeCurrency { get; set; }

    public virtual RateRateSheet RatesurchargeSheet { get; set; } = null!;

    public virtual SysRateStatus RatesurchargeStatusCodeNavigation { get; set; } = null!;
}
