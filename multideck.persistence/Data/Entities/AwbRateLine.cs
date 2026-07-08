using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

/// <summary>
/// AWB rating rows for class, chargeable weight, rate, and total charge.
/// </summary>
public partial class AwbRateLine
{
    public Guid AwbrateId { get; set; }

    public Guid AwbrateAwbid { get; set; }

    public Guid? AwbrateGoodsItemId { get; set; }

    public int AwbrateLineNumber { get; set; }

    public string? AwbrateRateClass { get; set; }

    public string? AwbrateCommodityItemNumber { get; set; }

    public decimal? AwbrateChargeableWeight { get; set; }

    public string AwbrateChargeableWeightUom { get; set; } = null!;

    public decimal? AwbrateRateOrCharge { get; set; }

    public decimal? AwbrateTotalChargeAmount { get; set; }

    public Guid? AwbrateCurrencyId { get; set; }

    public string? AwbrateCurrencyCodeSnapshot { get; set; }

    public string? AwbrateDescription { get; set; }

    public DateTime AwbrateCreatedAt { get; set; }

    public virtual AwbHeader AwbrateAwb { get; set; } = null!;

    public virtual AwbGoodsItem? AwbrateGoodsItem { get; set; }

    public virtual SysAwbrateClass? AwbrateRateClassNavigation { get; set; }
}
