using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

/// <summary>
/// AWB charge lines, including prepaid/collect and due-agent/due-carrier classifications.
/// </summary>
public partial class AwbCharge
{
    public Guid AwbcId { get; set; }

    public Guid AwbcAwbid { get; set; }

    public int AwbcLineNumber { get; set; }

    public string AwbcChargeType { get; set; } = null!;

    public string? AwbcPrepaidCollect { get; set; }

    public string? AwbcDueTo { get; set; }

    public string? AwbcDescription { get; set; }

    public decimal AwbcAmount { get; set; }

    public Guid? AwbcCurrencyId { get; set; }

    public string? AwbcCurrencyCodeSnapshot { get; set; }

    public decimal? AwbcTaxRate { get; set; }

    public decimal? AwbcTaxAmount { get; set; }

    public bool AwbcIsIncludedInTotal { get; set; }

    public string? AwbcSource { get; set; }

    public string? AwbcNotes { get; set; }

    public DateTime AwbcCreatedAt { get; set; }

    public virtual AwbHeader AwbcAwb { get; set; } = null!;

    public virtual SysAwbchargeType AwbcChargeTypeNavigation { get; set; } = null!;

    public virtual SysAwbprepaidCollectType? AwbcPrepaidCollectNavigation { get; set; }
}
