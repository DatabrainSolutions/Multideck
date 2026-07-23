using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RateResultAdjustment
{
    public Guid RateadjustId { get; set; }

    public Guid RateadjustResultId { get; set; }

    public Guid? RateadjustResultLineId { get; set; }

    public string RateadjustAdjustmentTypeCode { get; set; } = null!;

    public string? RateadjustDescription { get; set; }

    public decimal RateadjustAmount { get; set; }

    public decimal? RateadjustPercent { get; set; }

    public Guid? RateadjustCurrencyId { get; set; }

    public string? RateadjustCurrencyCodeSnapshot { get; set; }

    public string? RateadjustReason { get; set; }

    public DateTime RateadjustCreatedAt { get; set; }

    public Guid? RateadjustCreatedBy { get; set; }

    public virtual SysRateAdjustmentType RateadjustAdjustmentTypeCodeNavigation { get; set; } = null!;

    public virtual CmpUser? RateadjustCreatedByNavigation { get; set; }

    public virtual SysCurrency? RateadjustCurrency { get; set; }

    public virtual RateRateResult RateadjustResult { get; set; } = null!;

    public virtual RateRateResultLine? RateadjustResultLine { get; set; }
}
